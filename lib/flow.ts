export type Question = {
  field: string;
  text: string;
  // If present, the question is sent as tappable options:
  // up to 3 → WhatsApp reply buttons, more → WhatsApp list message
  options?: string[];
};

export const GREETING =
  "Welcome to GharJi 🏡\n\nHow can we help you today?";

export const GREETING_BUTTONS = [
  { id: "list_property", title: "🏠 List a Property" },
  { id: "find_property", title: "🔍 Find a Property" },
  { id: "talk_team", title: "💬 Talk to Our Team" },
];

export const LISTING_FLOW: Question[] = [
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

export const BUYER_FLOW: Question[] = [
  {
    field: "search_type",
    text: "Great! Let's find you the right property.\n\nAre you looking to *Buy* or *Rent*?",
    options: ["Buy", "Rent"],
  },
  {
    field: "location",
    text: "Which *location* are you looking in? (e.g. Sainik Farms, South Delhi)",
  },
  {
    field: "budget",
    text: "What's your *budget*? (e.g. ₹85,000/month or ₹3.2 Cr)",
  },
  {
    field: "property_type",
    text: "What *property type* are you looking for?",
    options: ["Apartment", "House", "Villa", "Plot", "Floor"],
  },
  {
    field: "bedrooms_size",
    text: "How many *bedrooms* or what *size* do you need? (e.g. 3 BHK, 2400 sq ft)",
  },
  {
    field: "contact",
    text: "Finally — your *contact name and number*?",
  },
];

export const LISTING_DONE =
  "✅ Thank you! Your listing has been received. Our team will review it and get back to you shortly.";

export const BUYER_DONE =
  "✅ Thank you! We've noted your requirements. Our team will get back to you with matching options shortly.";
