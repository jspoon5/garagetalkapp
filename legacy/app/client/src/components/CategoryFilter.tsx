import { Badge } from "@/components/ui/badge";

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}

export default function CategoryFilter({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={selectedCategory === null ? "default" : "secondary"}
        className="cursor-pointer hover-elevate active-elevate-2"
        onClick={() => onSelectCategory(null)}
        data-testid="filter-all"
      >
        All
      </Badge>
      {categories.map((category) => (
        <Badge
          key={category}
          variant={selectedCategory === category ? "default" : "secondary"}
          className="cursor-pointer hover-elevate active-elevate-2"
          onClick={() => onSelectCategory(category)}
          data-testid={`filter-${category.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {category}
        </Badge>
      ))}
    </div>
  );
}
