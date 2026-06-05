# Director Dashboard — Database Logic & Query Mapping

This document maps every KPI, metric, and alert in the Director Dashboard to concrete MongoDB queries derived from the actual database schema.

---

## Foundational Notes on the Schema

| Concept | Source | Key Fields |
|---|---|---|
| Employee | `users` | `_id`, `designation`, `roleId`, `isSuspended`, `isDeleted` |
| Attendance | `attendances` | `userId`, `date`, `checkInTime`, `displayStatus`, `status`, `siteId` |
| Leave | `leaves` | `userId`, `status`, `type`, `startDate`, `endDate`, `amount` |
| Site | `sites` | `_id`, `customerId`, `status`, `isDeleted` |
| Site-Engineer Link | `attendances` | An engineer is "at a site" when they have a recent attendance record with a `siteId` |
| Project / Customer | `customers` | `_id`, `name` — each customer IS a project (Hero, V-Green, HPCL, etc.) |
| Manager | `users` | `designation = "Project Manager"` or `roleId = "Manager"` |

> **Important gap noted:** There is no dedicated `projects` or `usersites` collection with data yet. Site-to-engineer assignments are inferred from `attendances.siteId`. A future `usersites` collection (already scaffolded in the DB) should formally track current assignments.

---

## Section 1: Workforce Overview

### KPI: Total Employees

**Definition:** All active employees (not suspended, not deleted).

```js
db.users.countDocuments({
  isDeleted: false,
  isSuspended: false
})
```

---

### KPI: Present Today

**Definition:** Employees who have an attendance record for today (regardless of check-out status).

```js
const today = "2026-06-04"; // YYYY-MM-DD

db.attendances.distinct("userId", {
  date: today
})
// then COUNT the distinct userIds
```

---

### KPI: On Leave

**Definition:** Employees with an Approved leave record that covers today's date.

```js
const today = "2026-06-04";

db.leaves.countDocuments({
  status: "Approved",
  isDeleted: false,
  startDate: { $lte: today },
  endDate:   { $gte: today }
})
```

---

### KPI: Attendance Not Marked

**Definition:** Active employees who neither have attendance today nor an approved leave covering today.

```js
// Step 1: Get user IDs present today
const presentIds = db.attendances.distinct("userId", { date: today });

// Step 2: Get user IDs on approved leave today
const onLeaveIds = db.leaves.distinct("userId", {
  status: "Approved",
  startDate: { $lte: today },
  endDate:   { $gte: today }
});

// Step 3: Combine both sets
const accountedIds = [...new Set([...presentIds, ...onLeaveIds])];

// Step 4: Count active employees NOT in that set
db.users.countDocuments({
  isDeleted: false,
  isSuspended: false,
  _id: { $nin: accountedIds }
})
```

---

### KPI: Late Employees

**Definition:** Employees whose `checkInTime` exceeded the shift start + grace period.

> **Current limitation:** There is no `shifts` or `shiftConfig` collection in the schema. You need to hardcode or configure a shift start time and grace period (e.g., 9:30 AM + 15 min grace = 9:45 AM = Unix offset).

```js
const today = "2026-06-04";
const shiftStartUnix = 1780540500; // 9:45 AM today as Unix timestamp

db.attendances.countDocuments({
  date: today,
  checkInTime: { $gt: shiftStartUnix }
})
```

---

### KPI: On Leave — LWP (Loss of Pay)

**Definition:** Active employees with an Approved leave of type `"LOSS OF PAY"` covering today.

```js
db.leaves.countDocuments({
  status: "Approved",
  type: "LOSS OF PAY",
  startDate: { $lte: today },
  endDate:   { $gte: today },
  isDeleted: false
})
```

---

### KPI: Traveling Employees

> **Gap:** There is no explicit `travelStatus` field on users or attendances. "Traveling" is currently not tracked structurally in the DB.
>
> **Recommended approach:** Add a `dailyStatus` field to the `users` collection with values like `"traveling"`, `"office"`, `"site"`, `"idle"`. Until then, this KPI cannot be derived from existing data.

---

### KPI: Idle Manpower

**Definition:** Active employees with no attendance record today AND no approved leave today — i.e., not at a site, not on leave.

```js
// This is the same set as "Attendance Not Marked"
// To further filter: employees with no siteId in recent attendances
const recentlyActiveSiteIds = db.attendances.distinct("userId", {
  date: { $gte: sevenDaysAgoDate }
});

db.users.countDocuments({
  isDeleted: false,
  isSuspended: false,
  _id: { $nin: recentlyActiveSiteIds }
})
```

---

### KPI: Site Engineers on Leave

**Definition:** Users with `designation` matching a site engineer role who have approved leave today.

> **Gap:** The DB currently uses free-text `designation` (e.g., `"sr.technician"`, `"Project Manager"`). You need to define and standardize which designations are "Site Engineers" (e.g., `"sr.technician"`, `"technician"`, `"site engineer"`).

```js
const siteEngineerDesignations = ["sr.technician", "technician", "site engineer"];

// Step 1: Get user IDs of site engineers on leave today
const engineerIds = db.users.distinct("_id", {
  designation: { $in: siteEngineerDesignations },
  isDeleted: false
});

db.leaves.countDocuments({
  userId: { $in: engineerIds },
  status: "Approved",
  startDate: { $lte: today },
  endDate:   { $gte: today }
})
```

---

## Section 2: Site Operations Overview

### KPI: Total Sites

```js
db.sites.countDocuments({ isDeleted: false })
```

---

### KPI: Sites by Status

> **Gap:** The current `sites.status` field only shows `"HOTO"` in the sample data. For the dashboard to show Active / Completed / Upcoming / Planned states, the status enum must be expanded and consistently used. Recommended values: `"Active"`, `"Completed"`, `"Planned"`, `"HOTO"`.

```js
db.sites.countDocuments({ isDeleted: false, status: "Active" })      // Active Sites
db.sites.countDocuments({ isDeleted: false, status: "Completed" })   // Completed Sites
db.sites.countDocuments({ isDeleted: false, status: "Planned" })     // Upcoming Sites
```

---

### KPI: Sites Without Engineers

**Definition:** Sites where no employee has checked in within the last N days.

```js
// Sites that have had attendance in the last 30 days
const activeSiteIds = db.attendances.distinct("siteId", {
  date: { $gte: thirtyDaysAgoDate }
});

// Sites with no attendance = no assigned engineer
db.sites.countDocuments({
  isDeleted: false,
  status: "Active",
  _id: { $nin: activeSiteIds.map(id => ObjectId(id)) }
})
```

---

### KPI: Sites At Risk

**Definition:** Sites matching any risk condition. Because there's no delay tracking collection yet, this must be derived from attendance gaps.

```js
// Proxy: Sites with no attendance in the last 7 days are "at risk"
const recentSiteIds = db.attendances.distinct("siteId", {
  date: { $gte: sevenDaysAgoDate }
});

db.sites.aggregate([
  {
    $match: {
      isDeleted: false,
      status: "Active",
      _id: { $nin: recentSiteIds.map(id => ObjectId(id)) }
    }
  },
  { $count: "sitesAtRisk" }
])
```

> **Recommendation:** Add a `targetDate`, `delayDays`, and `assignedEngineerId` field to the `sites` collection to enable proper risk calculation.

---

## Section 3: Site Engineer Utilization

> All engineer utilization KPIs depend on defining which `designation` values constitute "Site Engineers" (same note as Section 1).

### KPI: Total Site Engineers

```js
db.users.countDocuments({
  isDeleted: false,
  isSuspended: false,
  designation: { $in: siteEngineerDesignations }
})
```

---

### KPI: Deployed Engineers

**Definition:** Site engineers who have attendance today at any site.

```js
const engineerIds = db.users.distinct("_id", {
  designation: { $in: siteEngineerDesignations },
  isDeleted: false
});

db.attendances.distinct("userId", {
  date: today,
  userId: { $in: engineerIds }
}).length
```

---

### KPI: Idle Engineers

```js
const deployedToday = db.attendances.distinct("userId", { date: today });

db.users.countDocuments({
  isDeleted: false,
  isSuspended: false,
  designation: { $in: siteEngineerDesignations },
  _id: { $nin: deployedToday }
})
```

---

### KPIs: Engineers In Training / Survey / Material Collection / Traveling / Office

> **Gap:** These activity states (`"Survey"`, `"Material Collection"`, `"Traveling"`, `"Office"`, `"Training"`) do not exist in the current schema. The `attendances.checkInRemark` field contains free-text notes (e.g., `"foundation work civil"`), which is not suitable for categorical filtering.
>
> **Recommended fix:** Add a `currentActivity` enum field to `users` or create a `dailyStatus` collection updated each day by the employee or manager. Possible values: `"OnSite"`, `"Traveling"`, `"Survey"`, `"MaterialCollection"`, `"Office"`, `"Training"`, `"Idle"`.

---

### KPI: Engineers On Leave / On LWP

```js
// On Leave (any type)
db.leaves.countDocuments({
  userId: { $in: engineerIds },
  status: "Approved",
  startDate: { $lte: today },
  endDate:   { $gte: today }
})

// LWP specifically
db.leaves.countDocuments({
  userId: { $in: engineerIds },
  status: "Approved",
  type: "LOSS OF PAY",
  startDate: { $lte: today },
  endDate:   { $gte: today }
})
```

---

## Section 4: Project Performance Overview

**Projects = Customers** in the current schema. Each `customers` document is a project (Hero MotoCorp, V-Green, HPCL, etc.).

### KPI: Total Sites per Project (Monthly Target proxy)

```js
db.sites.countDocuments({
  customerId: ObjectId("69cce0fa42108d7ebec60b55"), // Hero MotoCorp _id
  isDeleted: false
})
```

### KPI: Completed Sites per Project

```js
db.sites.countDocuments({
  customerId: ObjectId("69cce0fa42108d7ebec60b55"),
  isDeleted: false,
  status: "Completed"
})
```

### KPI: Pending Sites per Project

```js
db.sites.countDocuments({
  customerId: ObjectId("..."),
  isDeleted: false,
  status: { $ne: "Completed" }
})
```

### KPI: Achievement %

```
Achievement % = (Completed Sites / Total Sites) × 100
```

Computed in application layer after fetching the above two counts.

---

### KPI: HR Target / Operations Target

> **Gap:** There is no `target` or `planningTarget` collection in the schema. These are manually committed targets and need a new collection or a field on `customers` (e.g., `hrTarget: Number`, `opsTarget: Number`, `monthlyTarget: Number`).

---

## Section 5: Project Manager Performance

**Project Managers** are identified by `designation = "Project Manager"` in the `users` collection.

```js
db.users.find({
  designation: "Project Manager",
  isDeleted: false
})
// Returns: Vijayan, Ravindran, Gaurav, Aditya, Vishu etc.
```

### KPI: Sites Assigned to a Manager

> **Gap:** There is no `managerId` or `assignedManagerId` field on the `sites` collection. Sites only have `customerId`.
>
> **Recommended fix:** Add `assignedManagerId: ObjectId` (ref `users._id`) to the `sites` schema to enable manager-level performance tracking.

Until then, this can be proxied by looking at which managers' team members (via `users.managerId`) have attended which sites.

---

### KPI: Manpower Utilization % per Manager

```js
// Engineers under this manager
const teamIds = db.users.distinct("_id", {
  managerId: ObjectId("managerUserId"),
  isDeleted: false
});

// Engineers from that team with attendance today
const deployedCount = db.attendances.distinct("userId", {
  date: today,
  userId: { $in: teamIds }
}).length;

// Utilization = deployedCount / teamIds.length * 100
```

---

## Section 6: Manpower Planning

### KPI: Available Manpower

```js
db.users.countDocuments({ isDeleted: false, isSuspended: false })
```

### KPI: Utilized Manpower

```js
db.attendances.distinct("userId", { date: today }).length
```

### KPI: Idle Manpower

```
Available − Utilized
```

### KPI: Required Manpower / Manpower Gap

> **Gap:** No planning/forecast collection exists. These need a `manpowerPlanning` collection with fields: `date`, `projectId`, `requiredHeadcount`, `notes`. Gap = Required − Available.

---

## Section 7: Critical Alerts

### Alert: Idle Engineer > 5 Days

```js
const fiveDaysAgo = "2026-05-30";

// Engineers who have NOT attended in the last 5 days
const recentlyActiveIds = db.attendances.distinct("userId", {
  date: { $gte: fiveDaysAgo }
});

db.users.find({
  isDeleted: false,
  isSuspended: false,
  designation: { $in: siteEngineerDesignations },
  _id: { $nin: recentlyActiveIds }
})
```

---

### Alert: Site Without Engineer

```js
const recentSiteIds = db.attendances.distinct("siteId", {
  date: { $gte: sevenDaysAgoDate }
});

db.sites.find({
  isDeleted: false,
  status: "Active",
  _id: { $nin: recentSiteIds.map(id => ObjectId(id)) }
})
```

---

### Alert: Project Behind Target

> Requires the `hrTarget` / `opsTarget` fields to be added to `customers`. Once added:

```js
db.customers.aggregate([
  {
    $lookup: {
      from: "sites",
      localField: "_id",
      foreignField: "customerId",
      as: "sites"
    }
  },
  {
    $project: {
      name: 1,
      target: "$monthlyTarget",
      completed: {
        $size: {
          $filter: {
            input: "$sites",
            as: "s",
            cond: { $eq: ["$$s.status", "Completed"] }
          }
        }
      }
    }
  },
  {
    $match: {
      $expr: {
        $lt: [
          { $divide: ["$completed", "$target"] },
          0.8  // Achievement < 80%
        ]
      }
    }
  }
])
```

---

### Alert: High LWP Count

```js
db.leaves.countDocuments({
  type: "LOSS OF PAY",
  status: "Approved",
  startDate: { $lte: today },
  endDate:   { $gte: today }
})
// Compare against configurable threshold stored in adminsettings
```

---

### Alert: High Absenteeism

```js
const totalActive = await db.users.countDocuments({ isDeleted: false, isSuspended: false });
const presentToday = await db.attendances.distinct("userId", { date: today });
const onLeaveToday = await db.leaves.distinct("userId", { status: "Approved", startDate: { $lte: today }, endDate: { $gte: today } });
const accounted = new Set([...presentToday, ...onLeaveToday]).size;
const absentPercent = ((totalActive - accounted) / totalActive) * 100;

// Fire alert if absentPercent > threshold (e.g., 20%)
```

---

## Charts — Data Sources

| Chart | Collection | Aggregation |
|---|---|---|
| Attendance Trend (30 days) | `attendances` | Group by `date`, count distinct `userId` per day; cross-reference `leaves` for leave count |
| Workforce Distribution | `users` + `attendances` + `leaves` | Categorize each user as Active/Leave/Traveling/Idle for today |
| Site Engineer Utilization | `attendances` + `users` | Group engineers by presence/absence today |
| Project Progress | `sites` grouped by `customerId` | Count by `status` per customer |

---

## Tables — Query Mapping

### Idle Manpower Table

```js
db.users.aggregate([
  {
    $match: {
      isDeleted: false,
      isSuspended: false,
      _id: { $nin: recentlyActiveIds }
    }
  },
  {
    $lookup: {
      from: "users",
      localField: "managerId",
      foreignField: "_id",
      as: "manager"
    }
  },
  {
    $project: {
      employeeId: 1,
      fullName: 1,
      lastName: 1,
      designation: 1,
      "manager.fullName": 1,
      "manager.lastName": 1
    }
  }
])
```

### Sites At Risk Table

```js
db.sites.aggregate([
  {
    $match: {
      isDeleted: false,
      status: "Active",
      _id: { $nin: recentSiteIds }
    }
  },
  {
    $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "project"
    }
  },
  {
    $project: {
      siteId: 1,
      name: 1,
      "project.name": 1,
      state: 1,
      district: 1
    }
  }
])
```

### Project Health Table

```js
db.customers.aggregate([
  {
    $lookup: {
      from: "sites",
      localField: "_id",
      foreignField: "customerId",
      as: "sites"
    }
  },
  {
    $project: {
      name: 1,
      total: { $size: "$sites" },
      completed: {
        $size: {
          $filter: { input: "$sites", as: "s", cond: { $eq: ["$$s.status", "Completed"] } }
        }
      },
      pending: {
        $size: {
          $filter: { input: "$sites", as: "s", cond: { $ne: ["$$s.status", "Completed"] } }
        }
      }
    }
  },
  {
    $addFields: {
      achievementPercent: {
        $cond: [
          { $gt: ["$total", 0] },
          { $multiply: [{ $divide: ["$completed", "$total"] }, 100] },
          0
        ]
      }
    }
  }
])
```

---

## Global Filters — Implementation

| Filter | How to Apply |
|---|---|
| Date Range | Pass as `$gte`/`$lte` on `attendances.date`, `leaves.startDate/endDate` |
| Project | Filter by `customers._id` → use as `sites.customerId` |
| Region / State / City | Filter on `sites.state`, `sites.city`, `sites.district` |
| Department | Filter on `users.designation` (once designations are standardized) |
| Manager | Filter on `users.managerId` to get team, or `sites.assignedManagerId` (to be added) |
| Site | Direct filter on `sites._id` |
| Employee Category | Filter on `users.designation` or `users.roleId` |

---

## Schema Gaps Summary & Recommendations

| Gap | Impact | Fix |
|---|---|---|
| No `currentActivity` field on users | Cannot show Traveling / Survey / Training counts | Add `currentActivity` enum to `users` or a daily status log collection |
| No `assignedManagerId` on sites | Cannot compute per-manager site assignment metrics | Add `assignedManagerId: ObjectId` to `sites` |
| No `monthlyTarget` / `hrTarget` on customers | Cannot compute Achievement %, Behind Target alerts | Add target fields to `customers` or create a `projectTargets` collection |
| `sites.status` enum not standardized | Active/Completed/Planned counts unreliable | Enforce enum: `"Active"`, `"Completed"`, `"Planned"`, `"HOTO"`, `"Cancelled"` |
| No shift/grace period config | Late employee KPI requires hardcoded times | Add `shiftConfig` to `adminsettings` collection |
| `designation` is free text | Filters by role/category are fragile | Standardize designations or add a `category` field: `"SiteEngineer"`, `"ProjectManager"`, `"OfficeStaff"` |
| No manpower planning collection | Required/Gap metrics cannot be computed | Create `manpowerplanning` collection with `date`, `customerId`, `requiredCount` |
| `usersites` collection is empty | No formal site-engineer assignment records | Populate when assigning engineers to sites |
