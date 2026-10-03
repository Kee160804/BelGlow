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
    name: "Men's Care",
    shopCategory: "Men's Care",
    description: "Simple grooming essentials for skin, hair, and beard.",
    subcategories: ["Beard Oil", "Beard Balm", "Shaving Cream", "Aftershave", "Men's Moisturizer", "Face Wash", "Body Wash", "Hair Products"],
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

export const products = [
  { id: 1, name: "Pink Peptide Serum", category: "Skincare", rating: "4.8 (320)", price: 28, position: "29% center" },
  { id: 2, name: "Tropical Body Butter", category: "Body Care", rating: "4.7 (210)", price: 24, position: "66% center" },
  { id: 3, name: "Moringa Curl Cream", category: "Hair Care", rating: "4.9 (184)", price: 22, position: "50% center" },
  { id: 4, name: "Island Bloom Body Mist", category: "Fragrance", rating: "4.8 (365)", price: 20, position: "84% center" },
  { id: 5, name: "Petal Shine Lip Gloss", category: "Cosmetics", rating: "4.6 (146)", price: 14, position: "31% center" },
  { id: 6, name: "Coconut Shower Oil", category: "Bath & Beauty", rating: "4.7 (118)", price: 19, position: "58% center" },
  { id: 7, name: "Aloe & Turmeric Glow Oil", category: "Natural & Herbal Care", rating: "4.9 (252)", price: 26, position: "29% center" },
  { id: 8, name: "BelGlow Self-Care Set", category: "Sets & Bundles", rating: "4.9 (96)", price: 48, position: "center" },
  { id: 9, name: "Brightening Face Cleanser", category: "Skincare", rating: "4.7 (288)", price: 18, position: "50% center" },
  { id: 10, name: "Cocoa Glow Body Oil", category: "Body Care", rating: "4.8 (174)", price: 21, position: "84% center" },
  { id: 11, name: "Castor Scalp Treatment", category: "Hair Care", rating: "4.8 (203)", price: 24, position: "29% center" },
  { id: 12, name: "Wild Orchid Perfume Oil", category: "Fragrance", rating: "4.9 (132)", price: 32, position: "31% center" },
  { id: 13, name: "Belize Sunset Blush", category: "Cosmetics", rating: "4.6 (89)", price: 16, position: "66% center" },
  { id: 14, name: "Pink Hibiscus Bath Salts", category: "Bath & Beauty", rating: "4.8 (102)", price: 17, position: "58% center" },
  { id: 15, name: "Gentle Baby Aloe Lotion", category: "Baby & Gentle Care", rating: "4.9 (77)", price: 15, position: "84% center" },
  { id: 16, name: "Rose Quartz Facial Roller", category: "Beauty Accessories", rating: "4.7 (141)", price: 25, position: "center" },
] as const;
