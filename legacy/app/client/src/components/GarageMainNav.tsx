import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/rooms", label: "Rooms" },
  { href: "/feed", label: "Feed" },
  { href: "/gearhead-ai", label: "GearHead AI" },
  { href: "/live", label: "Live" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/garage-profile", label: "Garage Profile" },
];

export default function GarageMainNav() {
  const [location] = useLocation();

  return (
    <nav className="border-t py-3">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const active = location === item.href || location.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
                data-testid={`main-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
