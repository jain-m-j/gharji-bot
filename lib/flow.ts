export const GREETING =
  "Welcome to GharJi 🏡\n\nYour real estate assistant. How can I help you today?";

export const QUESTIONS = [
  "Great! Let's get your property listed.\n\nAre you the *Owner* or a *Broker*?",
  "Is this for *Rent* or *Sale*?",
  "What's the *property type*? (Apartment / House / Villa / Plot / Floor)",
  "Which *location*? (e.g. Sainik Farms, South Delhi)",
  "What's the *price / rent*? (e.g. ₹85,000/month or ₹3.2 Cr)",
  "How many *bedrooms*, and what's the *size*? (e.g. 3 BHK, 2400 sq ft)",
  "Do you have *photos or video*? Reply *Yes* or *No* (you can send them after).",
  "Finally — your *contact name and number*?",
];

export const FIELDS = [
  "role",
  "listing_type",
  "property_type",
  "location",
  "price",
  "bedrooms_size",
  "has_media",
  "contact",
] as const;
