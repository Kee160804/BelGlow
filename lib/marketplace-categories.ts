export type MarketplaceCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

export function categoryChildren(categories: MarketplaceCategory[], parentId: string) {
  return categories
    .filter((category) => category.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function rootCategories(categories: MarketplaceCategory[]) {
  return categories
    .filter((category) => !category.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function categoryLabel(category: MarketplaceCategory, categories: MarketplaceCategory[]) {
  const parent = categories.find((item) => item.id === category.parent_id);
  return parent ? `${parent.name} — ${category.name}` : category.name;
}
