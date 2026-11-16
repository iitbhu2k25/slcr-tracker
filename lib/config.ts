/**
 * Site settings for the SLCR Progress Tracker.
 * Edit these values to change the lab, project, roster and lists, then redeploy.
 */

export const LAB = "Smart Laboratory on Clean Rivers (SLCR)";
export const INSTITUTE = "Indian Institute of Technology (BHU), Varanasi";
export const PROJECT = "Decision Support System for Water Resource Management";
export const APP_NAME = "SLCR Progress Tracker";

/** All dates ("today", report periods, timestamps) are worked out in this time zone. */
export const TIMEZONE = "Asia/Kolkata";

/** Accounts offered by "Create roster accounts" on the Staff accounts page. */
export const ROSTER = [
  { username: "rajat", name: "Mr. Rajat Saxena", designation: "Young Professional" },
  { username: "rajk", name: "Mr. Raj Kumar", designation: "Junior Research Fellow (JRF)" },
  { username: "gaurav", name: "Mr. Gaurav Kumar", designation: "Project Assistant" },
  { username: "anas", name: "Mr. Anas", designation: "Project Assistant" },
  { username: "akash", name: "Dr. Akash Tiwar", designation: "Research Associate" },
];

export const DESIGNATIONS = [
  "Young Professional",
  "Junior Research Fellow (JRF)",
  "Senior Research Fellow (SRF)",
  "Project Assistant",
  "Project Associate",
  "Research Associate",
  "Other",
];

export const CATEGORIES = [
  "Field survey / water sampling",
  "Hydrological data collection & processing",
  "GIS & remote sensing",
  "Hydrological / hydraulic modelling",
  "DSS software development",
  "Water-quality lab analysis",
  "Literature review",
  "Report / manuscript writing",
  "Meeting / stakeholder consultation",
  "Training / workshop / conference",
  "Administrative / procurement",
  "On leave",
];
export const LEAVE_CATEGORY = "On leave";

export const LOCATIONS = ["Office / Lab", "Field site", "Work from home", "Travel / external meeting"];
export const STATUSES = ["Completed", "In progress", "Pending", "Blocked"];

/** Days counted as working days in reports. 0 = Sunday ... 6 = Saturday. */
export const WORKING_DAYS = [1, 2, 3, 4, 5];

export const SESSION_HOURS = 12;
export const MAX_LOGIN_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 8;
