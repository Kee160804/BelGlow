export const policies = {
  terms: { title: "Terms of Service", summary: "The rules for using the BelGlow marketplace.", sections: [
    ["Marketplace role", "BelGlow provides an online marketplace where independent sellers list products and receive customer orders. Unless a product is clearly identified as sold by the BelGlow Official Store, the independent seller—not BelGlow—is the product seller and is responsible for product accuracy, quality, preparation, delivery, and seller-specific customer service."],
    ["Accounts and acceptable use", "Users must provide accurate information, keep account credentials secure, and may not misuse the marketplace, interfere with its operation, commit fraud, scrape protected information, or upload unlawful or misleading content."],
    ["Orders", "An order is subject to product availability and seller acceptance. BelGlow may cancel or restrict orders affected by errors, suspected fraud, unavailable stock, policy violations, or a seller’s inability to fulfill."],
    ["Marketplace service fee", "BelGlow may charge sellers a disclosed service fee on marketplace sales. The applicable rate is recorded when an order is created and does not make BelGlow the manufacturer or fulfillment provider for an independent seller’s products."],
    ["Disputes", "Customers should first use the order and support tools provided by BelGlow. BelGlow may review marketplace records, request evidence, and coordinate a resolution under the published policies."],
  ] },
  privacy: { title: "Privacy Policy", summary: "How BelGlow uses and protects marketplace information.", sections: [
    ["Information collected", "BelGlow processes account details, contact information, delivery addresses, order records, saved products and sellers, support messages, seller business information, and technical information needed to operate and secure the marketplace."],
    ["How information is used", "Information is used to provide accounts and checkout, route orders to the correct seller, support customers and sellers, prevent abuse, administer the marketplace, maintain records, and improve reliability."],
    ["Information shared with sellers", "When a customer orders from an independent seller, that seller receives the order items and the contact, delivery, and instruction details reasonably required to fulfill the order. Sellers may use this information only for fulfillment and related customer service."],
    ["Retention and choices", "Marketplace records are retained as needed for operations, fraud prevention, disputes, legal obligations, and financial records. Account holders may contact BelGlow to request access, correction, export, or deletion where applicable."],
  ] },
  delivery: { title: "Seller Delivery Policy", summary: "How fulfillment works when independent sellers receive an order.", sections: [
    ["Seller responsibility", "Each independent seller is responsible for preparing the products they sell and arranging delivery or pickup with the customer. BelGlow hosts the order and communication records but is not the delivery carrier."],
    ["Delivery arrangements", "The seller should contact the customer using the order details, confirm any seller delivery charge before fulfillment when it was not collected at checkout, and provide a realistic delivery or pickup timeframe."],
    ["Tracking and updates", "Sellers must keep the order status current and provide carrier or tracking information when available. Customers can use their BelGlow account or guest order tracker to follow recorded updates."],
    ["Delays and failed delivery", "Sellers must promptly inform the customer about delays or delivery problems. Customers should contact the seller through the order process or submit a BelGlow support request when help is needed."],
  ] },
  returns: { title: "Returns and Refunds", summary: "The marketplace process for cancellations, returns, and refunds.", sections: [
    ["Seller return terms", "Independent sellers set a return window in their storefront settings, subject to BelGlow’s minimum marketplace standards and applicable law. Hygiene-sensitive or opened beauty products may be ineligible unless defective, damaged, incorrect, or misrepresented."],
    ["Requesting help", "Customers should submit a cancellation, return, or refund request from their order record. Guest customers may use the order tracker or Contact page. Include the affected item, reason, and relevant evidence."],
    ["Review and resolution", "BelGlow may coordinate with the seller, review order and delivery records, and request photographs or other evidence. Approval is not automatic and depends on the product condition, timing, seller policy, and reason."],
    ["Refund timing", "Approved refunds are recorded through the original or agreed method. Processing time depends on the final payment method. Delivery charges may be excluded unless the seller failed to fulfill correctly."],
  ] },
  sellers: { title: "Seller Agreement", summary: "The responsibilities accepted by businesses selling through BelGlow.", sections: [
    ["Independent seller status", "The seller operates an independent business. The seller is not an employee, delivery agent, partner, or representative of BelGlow and is responsible for its own business, product, tax, licensing, and consumer obligations."],
    ["Listings and products", "Sellers must provide accurate descriptions, ingredients where applicable, prices, inventory, images, instructions, warnings, and claims. Counterfeit, unsafe, prohibited, expired, or misleading products are not permitted."],
    ["Fulfillment", "Sellers are responsible for accepting, preparing, packaging, delivering or arranging pickup, recording status updates, and responding to customers within a reasonable period."],
    ["Service fees and records", "BelGlow may deduct or invoice the configured marketplace service fee for sales made through the platform. Sellers must not manipulate orders to avoid disclosed marketplace fees."],
    ["Enforcement", "BelGlow may request evidence, reject listings, suspend stores, remove content, hold marketplace actions, or close seller access when necessary to protect customers or enforce marketplace rules."],
  ] },
  products: { title: "Product and Content Standards", summary: "Standards for listings, beauty claims, reviews, and prohibited content.", sections: [
    ["Product safety", "Sellers must ensure products are lawful, authentic, correctly stored, within their usable date, and accompanied by relevant ingredient, allergy, usage, and safety information."],
    ["Beauty and health claims", "Listings may not promise medical outcomes, guaranteed results, or unsupported certifications. Customers should review ingredients, follow directions, patch test new topical products, and seek professional guidance for medical concerns."],
    ["Images and descriptions", "Images must represent the actual product. Descriptions, quantities, sizes, stock, origin, and pricing must not be misleading. BelGlow approval does not replace the seller’s continuing responsibility for accuracy."],
    ["Reviews and conduct", "Reviews must reflect genuine experiences. Incentivized, fabricated, abusive, private, or irrelevant content may be rejected or removed. Sellers may reply professionally but may not pressure customers to alter honest feedback."],
  ] },
} as const;

export type PolicySlug = keyof typeof policies;
