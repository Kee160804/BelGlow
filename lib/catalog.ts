// Central catalog data keeps the homepage, category directory, and future shop pages in sync.
export const departments = [
  {
    name: "Face Care",
    shopCategory: "Skincare",
    description: "Daily essentials and targeted care for healthy, radiant skin.",
    subcategories: ["Facial Cleansers", "Face Wash", "Toners", "Serums", "Moisturizers", "Face Creams", "Facial Oils", "Face Masks", "Exfoliators & Scrubs", "Acne Care", "Eye Creams", "Lip Care", "Sunscreen & SPF"],
  },
  {
    name: "Body Care",
    shopCategory: "Body Care",
    description: "Nourishing care from shoulders to toes.",
    subcategories: ["Body Lotion", "Body Cream", "Body Butter", "Body Oil", "Body Wash", "Shower Gel", "Body Scrub", "Body Mist", "Hand Cream", "Foot Cream", "Deodorant", "Soaps"],
  },
  {
    name: "Hair Care",
    shopCategory: "Hair Care",
    description: "Moisture, growth, protection, and styling for every texture.",
    subcategories: ["Shampoo", "Conditioner", "Hair Oil", "Hair Moisturizer", "Leave-In Conditioner", "Hair Masks & Treatments", "Scalp Oil", "Edge Control", "Styling Gel", "Curl Cream", "Hair Growth", "Heat Protectant"],
  },
  {
    name: "Bath & Shower",
    shopCategory: "Bath & Beauty",
    description: "Turn every bath and shower into a calming ritual.",
    subcategories: ["Bar Soap", "Liquid Soap", "Bath Salts", "Bath Bombs", "Shower Oils", "Bubble Bath", "Body Wash", "Exfoliating Products"],
  },
  {
    name: "Beauty & Cosmetics",
    shopCategory: "Cosmetics",
    description: "Everyday color and finishing touches that celebrate you.",
    subcategories: ["Foundation", "Concealer", "Powder", "Blush", "Lip Gloss", "Lipstick", "Mascara", "Eyeliner", "Eyebrow Products", "Setting Spray"],
  },
  {
    name: "Fragrance",
    shopCategory: "Fragrance",
    description: "Personal scents for every mood and moment.",
    subcategories: ["Perfumes", "Body Sprays", "Body Mists", "Perfume Oils", "Fragrance Sets"],
  },
  {
    name: "Baby & Gentle Care",
    shopCategory: "Baby & Gentle Care",
    description: "Comforting formulas for babies and sensitive skin.",
    subcategories: ["Baby Lotion", "Baby Oil", "Gentle Wash", "Baby Shampoo", "Sensitive-Skin Products"],
  },
  {
    name: "Natural & Herbal Care",
    shopCategory: "Natural & Herbal Care",
    description: "Tropical botanicals inspired by Belizean nature.",
    subcategories: ["Aloe Products", "Coconut Oil", "Castor Oil", "Moringa Products", "Turmeric Products", "Herbal Oils", "Natural Soaps", "Botanical Skincare"],
  },
  {
    name: "Beauty Accessories",
    shopCategory: "Beauty Accessories",
    description: "Tools and accessories that complete every routine.",
    subcategories: ["Facial Rollers", "Gua Sha", "Brushes", "Combs", "Hair Bonnets", "Shower Caps", "Makeup Brushes", "Cosmetic Bags", "Applicators", "Skincare Tools"],
  },
  {
    name: "Sets & Bundles",
    shopCategory: "Sets & Bundles",
    description: "Curated routines, thoughtful gifts, and easy starter kits.",
    subcategories: ["Skincare Sets", "Haircare Sets", "Body-Care Sets", "Gift Boxes", "Travel Sets", "Starter Kits", "Seasonal Bundles"],
  },
] as const;

export const homeCategories = [
  { name: "Skincare", count: 52, position: "58% center" },
  { name: "Body Care", count: 34, position: "67% center" },
  { name: "Hair Care", count: 28, position: "48% center" },
  { name: "Fragrance", count: 18, position: "31% center" },
  { name: "Cosmetics", count: 41, position: "84% center" },
  { name: "Bath & Beauty", count: 24, position: "center" },
] as const;

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  rating: string;
  price: number;
  position: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  variantId?: string;
  subtitle?: string;
  ingredients?: string;
  usageInstructions?: string;
  shippingInfo?: string;
  sellerName?: string;
  sellerStoreId?: string;
  sellerSlug?: string;
  compareAtPrice?: number;
  stock?: number;
  variants?: Array<{ id: string; name: string; price: number; stock: number }>;
};
