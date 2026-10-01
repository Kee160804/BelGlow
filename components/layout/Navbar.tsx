"use client";

import Link from "next/link";
import {
  Heart,
  Menu,
  Search,
  ShoppingBag,
  User,
} from "lucide-react";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-pink-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="relative flex h-10 w-10 items-center justify-center">
            <span className="absolute h-7 w-4 -rotate-45 rounded-full bg-pink-300" />
            <span className="absolute ml-4 mt-2 h-7 w-4 rotate-45 rounded-full bg-pink-500" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Bel<span className="text-pink-500">Glow</span>
            </h1>

            <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-pink-500">
              Belizean Beauty. Naturally You.
            </p>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 lg:flex">
          <Link
            href="/"
            className="text-sm font-semibold text-pink-500"
          >
            Home
          </Link>

          <Link
            href="/shop"
            className="text-sm font-medium text-neutral-700 transition hover:text-pink-500"
          >
            Shop
          </Link>

          <Link
            href="/categories"
            className="text-sm font-medium text-neutral-700 transition hover:text-pink-500"
          >
            Categories
          </Link>

          <Link
            href="/about"
            className="text-sm font-medium text-neutral-700 transition hover:text-pink-500"
          >
            About
          </Link>

          <Link
            href="/blog"
            className="text-sm font-medium text-neutral-700 transition hover:text-pink-500"
          >
            Blog
          </Link>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-5 md:flex">

          {/* Search */}
          <div className="flex w-60 items-center rounded-full border border-pink-100 bg-pink-50/50 px-4 py-2.5">
            <input
              type="text"
              placeholder="Search skincare, brands..."
              className="w-full bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
            />

            <Search size={18} />
          </div>

          <button
            aria-label="Account"
            className="transition hover:text-pink-500"
          >
            <User size={22} />
          </button>

          <button
            aria-label="Wishlist"
            className="transition hover:text-pink-500"
          >
            <Heart size={22} />
          </button>

          <button
            aria-label="Shopping cart"
            className="relative transition hover:text-pink-500"
          >
            <ShoppingBag size={22} />

            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-[10px] font-bold text-white">
              2
            </span>
          </button>
        </div>

        {/* Mobile Actions */}
        <div className="flex items-center gap-4 md:hidden">
          <button aria-label="Search">
            <Search size={22} />
          </button>

          <button
            aria-label="Shopping cart"
            className="relative"
          >
            <ShoppingBag size={22} />

            <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[9px] font-bold text-white">
              2
            </span>
          </button>

          <button aria-label="Open menu">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </header>
  );
}