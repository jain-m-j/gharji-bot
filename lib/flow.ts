export type Question = {
  field: string;
  text: string;
  // If present, the question is sent as tappable options:
  // up to 3 → WhatsApp reply buttons, more → WhatsApp list message
  options?: string[];
};

export const GREETING =
  "Welcome to GharJi 🏡\n\nI'm the GharJi assistant. How can I help you today?";

export const FLOW: Question[] = [
  {
    field: "role",
    text: "Great! Let's get your property listed.\n\nAre you the *Owner* or a *Broker*?",
    options: ["Owner", "Broker"],
  },
  {
    field: "listing_type",
    text: "Is this for *Rent* or *Sale*?",
    options: ["Rent", "Sale"],
  },
  {
    field: "property_type",
    text: "What's the *property type*?",
    options: ["Apartment", "House", "Villa", "Plot", "Floor"],
  },
  {
    field: "location",
    text: "Which *location*? (e.g. Sainik Farms, South Delhi)",
  },
  {
    field: "price",
    text: "What's the *price / rent*? (e.g. ₹85,000/month or ₹3.2 Cr)",
  },
  {
    field: "bedrooms_size",
    text: "How many *bedrooms*, and what's the *size*? (e.g. 3 BHK, 2400 sq ft)",
  },
  {
    field: "has_media",
    text: "Do you have *photos or video*? (you can send them after)",
    options: ["Yes", "No"],
  },
  {
    field: "contact",
    text: "Finally — your *contact name and number*?",
  },
];
