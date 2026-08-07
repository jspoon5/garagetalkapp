import { useState } from 'react';
import CategoryFilter from '../CategoryFilter';

export default function CategoryFilterExample() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    "Engine Faults",
    "Ignition",
    "Cooling System",
    "Sensors",
    "Tools & Tips",
    "Transmission",
    "Electrical"
  ];

  return (
    <CategoryFilter
      categories={categories}
      selectedCategory={selectedCategory}
      onSelectCategory={setSelectedCategory}
    />
  );
}
