/* A complete, working configuration from the Emergency Vault.
 *
 * This is the file you actually write for a new product. The engine reads
 * SECTIONS and generates: the sidebar, every table, grid and calendar view,
 * the add/edit form, filters, sorting, search, CSV export, the column
 * picker and every printed table. An hour here produces most of the app.
 *
 * Field types the engine understands:
 *   text  textarea  number  date  url  select  attachments
 *   <entity>_select   <entity>_multi      (e.g. member_select)
 * Per-section keys:
 *   title icon group singular desc isEntity entityLabel
 *   dateField dueFields hasCalendar totalField fields[] filters[]
 * Per-field keys:
 *   name label type required options[] printLabel
 */

const THEMES = {
            indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81' },
            teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a' },
            emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
            rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337' },
            amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' }
        };

const NAV_GROUPS = [
            { id: 'first', label: 'First 24 Hours' },
            { id: 'people', label: 'People' },
            { id: 'money', label: 'Money & Cover' },
            { id: 'property', label: 'Property' },
            { id: 'setup', label: 'Setup' }
        ];

const ONBOARDING_SLIDES = [
            { icon: "ph-shield-check", title: "Welcome to your Emergency Vault", desc: "Everything the people you trust would need if you could not tell them yourself: who to call, what to do first, where things are kept. One private, offline file. No account, no subscription, nothing leaves this device." },
            { icon: "ph-users", title: "Start with the people", desc: "Add your household first. Medical notes, dependents, vehicles and directives all file against a person, so the vault can be narrowed to one of them at a time." },
            { icon: "ph-printer", title: "The page you leave on the fridge", desc: "One printed sheet with the first-24-hours actions, who to call and the medical flags that matter. Print it, put a copy in a fireproof box, and hand one to whoever would need it." },
            { icon: "ph-lock-simple", title: "Never store passwords here", desc: "Record where a password lives \u2014 the manager, the safe, the envelope \u2014 never the password itself. The PIN is a privacy screen, not encryption. Some modules are hidden to start with; switch them on any time in Settings.", isFinal: true }
        ];

const SECTIONS = {
            dashboard: { title: "Overview", icon: "ph-squares-four" },

            protocol: {
                title: "First 24 Hours", icon: "ph-clock-countdown", group: "first",
                singular: "Action", desc: "The steps someone should take first, in order.",
                dateField: "review_due", hasCalendar: false,
                fields: [
                    { name: "task", label: "Action", type: "text", required: true, printLabel: "Action" },
                    { name: "priority", label: "When", type: "select", required: true,
                      options: ["\ud83d\udd34 Immediately", "\ud83d\udfe1 Within 24 hours", "\ud83d\udfe2 Within a week", "\u26aa When settled"] },
                    { name: "owner", label: "Who does it", type: "member_select" },
                    { name: "contact", label: "Who to call", type: "text" },
                    { name: "phone", label: "Phone", type: "text" },
                    { name: "review_due", label: "Review by", type: "date" },
                    { name: "notes", label: "Instructions", type: "textarea" }
                ]
            },

            documents: {
                title: "Where Things Are", icon: "ph-folder-open", group: "first",
                singular: "Item", desc: "Where the originals live \u2014 deeds, wills, passports, keys, safes.",
                dateField: "expires",
                fields: [
                    { name: "item", label: "Document or item", type: "text", required: true },
                    { name: "kind", label: "Type", type: "select",
                      options: ["Will or trust", "Deed or title", "Passport or ID", "Certificate", "Key or safe", "Policy", "Other"] },
                    { name: "location", label: "Where it is kept", type: "text", required: true },
                    { name: "person", label: "Belongs to", type: "member_select" },
                    { name: "expires", label: "Expires", type: "date" },
                    { name: "notes", label: "Notes", type: "textarea" },
                    { name: "attachments", label: "Photos", type: "attachments" }
                ]
            },

            members: {
                title: "Household", icon: "ph-users-three", group: "people",
                singular: "Person", desc: "Everyone the vault covers, including pets.",
                isEntity: true, entityLabel: "person",
                fields: [
                    { name: "name", label: "Name", type: "text", required: true },
                    { name: "role", label: "Who they are", type: "select", required: true,
                      options: ["Adult", "Teen", "Child", "Dependent", "Pet", "Other"] },
                    { name: "dob", label: "Date of birth", type: "date" },
                    { name: "phone", label: "Phone", type: "text" },
                    { name: "notes", label: "Notes", type: "textarea" }
                ]
            },

            medical: {
                title: "Medical & Directives", icon: "ph-first-aid-kit", group: "people",
                singular: "Record", desc: "Allergies, conditions and the wishes someone has put in writing.",
                dateField: "reviewed",
                fields: [
                    { name: "member", label: "Person", type: "member_select", required: true },
                    { name: "blood_type", label: "Blood type", type: "select",
                      options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"] },
                    { name: "allergies", label: "Allergies", type: "text" },
                    { name: "conditions", label: "Conditions", type: "text" },
                    { name: "medications", label: "Medications", type: "textarea" },
                    { name: "doctor", label: "Doctor or surgery", type: "text" },
                    { name: "doctor_phone", label: "Surgery phone", type: "text" },
                    { name: "directive", label: "Directive on file", type: "select",
                      options: ["None recorded", "Advance directive", "Power of attorney", "Both", "Other"] },
                    { name: "directive_location", label: "Where the directive is kept", type: "text" },
                    { name: "reviewed", label: "Last reviewed", type: "date" },
                    { name: "notes", label: "Notes", type: "textarea" }
                ]
            },

            contacts: {
                title: "Who to Call", icon: "ph-phone-call", group: "people",
                singular: "Contact", desc: "The people and services someone would need to reach.",
                fields: [
                    { name: "name", label: "Name", type: "text", required: true },
                    { name: "role", label: "Role", type: "select", required: true,
                      options: ["Family", "Neighbour", "Doctor", "Solicitor", "Accountant", "Executor", "Employer", "School", "Utility", "Insurer", "Other"] },
                    { name: "phone", label: "Phone", type: "text" },
                    { name: "email", label: "Email", type: "text" },
                    { name: "for_person", label: "Relates to", type: "member_select" },
                    { name: "notes", label: "Notes", type: "textarea" }
                ]
            },

            financial: {
                title: "Accounts", icon: "ph-bank", group: "money",
                singular: "Account", desc: "Where the money is. Never record passwords or full numbers here.",
                fields: [
                    { name: "institution", label: "Institution", type: "text", required: true },
                    { name: "kind", label: "Type", type: "select", required: true,
                      options: ["Current", "Savings", "Pension", "Investment", "Mortgage", "Loan", "Credit card", "Other"] },
                    { name: "holder", label: "Held by", type: "member_select" },
                    { name: "reference", label: "Reference (last 4 digits only)", type: "text" },
                    { name: "approx_value", label: "Approximate value", type: "number" },
                    { name: "where_paperwork", label: "Where the paperwork is", type: "text" },
                    { name: "notes", label: "Notes", type: "textarea" }
                ]
            },

            insurance: {
                title: "Insurance & Legal", icon: "ph-shield-check", group: "money",
                singular: "Policy", desc: "Cover in place and when it needs renewing.",
                dateField: "renews",
                dueFields: ["renews"],
                fields: [
                    { name: "provider", label: "Provider", type: "text", required: true },
                    { name: "kind", label: "Type", type: "select", required: true,
                      options: ["Life", "Home", "Contents", "Vehicle", "Health", "Travel", "Legal", "Other"] },
                    { name: "policy_no", label: "Policy number", type: "text" },
                    { name: "covers", label: "Covers", type: "member_multi" },
                    { name: "renews", label: "Renews", type: "date" },
                    { name: "premium", label: "Premium", type: "number" },
                    { name: "phone", label: "Claims phone", type: "text" },
                    { name: "notes", label: "Notes", type: "textarea" }
                ]
            },

            digital: {
                title: "Digital Estate", icon: "ph-device-mobile", group: "money",
                singular: "Account", desc: "Online accounts and where their passwords live \u2014 never the passwords.",
                fields: [
                    { name: "service", label: "Service", type: "text", required: true },
                    { name: "username", label: "Username or email", type: "text" },
                    { name: "password_location", label: "Where the password is kept", type: "text", required: true,
                      printLabel: "Password kept" },
                    { name: "mfa", label: "Two-factor method", type: "text" },
                    { name: "owner", label: "Belongs to", type: "member_select" },
                    { name: "wishes", label: "What should happen to it", type: "select",
                      options: ["Close it", "Memorialise it", "Transfer it", "Leave it", "Undecided"] },
                    { name: "notes", label: "Instructions", type: "textarea" }
                ]
            },

            property: {
                title: "Property & Safes", icon: "ph-house-line", group: "property",
                singular: "Item", desc: "Homes, safes, storage and anything with a key or a code kept elsewhere.",
                fields: [
                    { name: "item", label: "Property or item", type: "text", required: true },
                    { name: "kind", label: "Type", type: "select",
                      options: ["Home", "Rental", "Land", "Safe", "Storage unit", "Safety deposit box", "Valuable", "Other"] },
                    { name: "location", label: "Where it is", type: "text" },
                    { name: "key_location", label: "Where the key or code is kept", type: "text" },
                    { name: "approx_value", label: "Approximate value", type: "number" },
                    { name: "notes", label: "Notes", type: "textarea" },
                    { name: "attachments", label: "Photos", type: "attachments" }
                ]
            },

            vehicles: {
                title: "Vehicles", icon: "ph-car", group: "property",
                singular: "Vehicle", desc: "What is on the drive and when it is next due.",
                dateField: "next_due",
                dueFields: ["next_due"],
                fields: [
                    { name: "vehicle", label: "Vehicle", type: "text", required: true },
                    { name: "reg", label: "Registration", type: "text" },
                    { name: "keeper", label: "Registered keeper", type: "member_select" },
                    { name: "insurer", label: "Insurer", type: "text" },
                    { name: "next_due", label: "Next MOT or service", type: "date" },
                    { name: "key_location", label: "Where the spare key is", type: "text" },
                    { name: "notes", label: "Notes", type: "textarea" }
                ]
            },

            evacuation: {
                title: "If You Must Leave", icon: "ph-map-pin-line", group: "property",
                singular: "Plan", desc: "Meeting points, routes out, and what to take.",
                fields: [
                    { name: "plan", label: "Plan or place", type: "text", required: true },
                    { name: "kind", label: "Type", type: "select", required: true,
                      options: ["Meeting point", "Route out", "Somewhere to stay", "Grab bag", "Utility shut-off", "Other"] },
                    { name: "address", label: "Address or detail", type: "text" },
                    { name: "who", label: "Who this is for", type: "member_multi" },
                    { name: "notes", label: "Instructions", type: "textarea" }
                ]
            }
        };
