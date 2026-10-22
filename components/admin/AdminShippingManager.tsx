import { Store, Truck } from "lucide-react";

export default function AdminShippingManager() {
  return <section className="rounded-2xl border border-[#e9dfdc] bg-white p-6">
    <div className="flex items-center gap-3"><Truck className="text-[#a75754]" /><div><h2 className="text-lg font-bold">Seller-arranged fulfillment</h2><p className="text-sm text-[#756a6d]">The marketplace does not sell or promise delivery.</p></div></div>
    <div className="mt-5 rounded-2xl bg-[#faf6f4] p-4 text-sm leading-6 text-[#62595c]"><p className="flex items-center gap-2 font-bold"><Store size={17} /> Seller responsibility</p><p className="mt-2">Every seller prepares the order, contacts the customer, arranges delivery or pickup, supplies tracking when available, and handles its return policy.</p></div>
    <p className="mt-4 text-xs leading-5 text-[#817679]">BelGlow records a zero-cost fulfillment selection at checkout so the product total never misrepresents a delivery fee. Sellers may agree a separate delivery charge directly with the customer.</p>
  </section>;
}
