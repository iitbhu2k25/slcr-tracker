"""Site settings for the SLCR Progress Tracker.

Edit the values in this file to change the lab, project, staff roster,
work categories and other lists shown in the app. Restart the app after
editing.
"""

LAB = "Smart Laboratory on Clean Rivers (SLCR)"
INSTITUTE = "Indian Institute of Technology (BHU), Varanasi"
PROJECT = "Decision Support System for Water Resource Management"
APP_NAME = "SLCR Progress Tracker"

# Staff accounts created by `python manage.py init --with-roster`.
# username is what each person types on the login page.
ROSTER = [
    {"username": "rajat",  "name": "Mr. Rajat Saxena", "designation": "Young Professional"},
    {"username": "rajk",   "name": "Mr. Raj Kumar",    "designation": "Junior Research Fellow (JRF)"},
    {"username": "gaurav", "name": "Mr. Gaurav Kumar", "designation": "Project Assistant"},
    {"username": "anas",   "name": "Mr. Anas",         "designation": "Project Assistant"},
    {"username": "akash",  "name": "Dr. Akash Tiwar",  "designation": "Research Associate"},
]

DESIGNATIONS = [
    "Young Professional",
    "Junior Research Fellow (JRF)",
    "Senior Research Fellow (SRF)",
    "Project Assistant",
    "Project Associate",
    "Research Associate",
    "Other",
]

CATEGORIES = [
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
]
LEAVE_CATEGORY = "On leave"

LOCATIONS = ["Office / Lab", "Field site", "Work from home", "Travel / external meeting"]
STATUSES = ["Completed", "In progress", "Pending", "Blocked"]

# Days counted as working days in reports (Monday=0 ... Sunday=6).
WORKING_WEEKDAYS = {0, 1, 2, 3, 4}

# Security
SESSION_HOURS = 12            # how long a login lasts
MAX_LOGIN_FAILURES = 5        # failures allowed per username+IP ...
LOCKOUT_MINUTES = 15          # ... before a temporary lockout
MIN_PASSWORD_LENGTH = 8
