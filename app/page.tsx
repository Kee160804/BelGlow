import Storefront from "@/components/home/Storefront";

export default async function Home({ searchParams }: PageProps<"/">) {
  const requestedCategory = (await searchParams).category;
  const requestedQuery = (await searchParams).q;
  const initialCategory = typeof requestedCategory === "string" ? requestedCategory : "All";
  const initialQuery = typeof requestedQuery === "string" ? requestedQuery : "";

  return <Storefront initialCategory={initialCategory} initialQuery={initialQuery} />;
}
