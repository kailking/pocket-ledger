import {
  BanknoteArrowDown,
  Beef,
  BriefcaseBusiness,
  BusFront,
  CircleDollarSign,
  CreditCard,
  Fuel,
  Gift,
  HandCoins,
  Home,
  Landmark,
  Plane,
  ReceiptText,
  Shirt,
  ShoppingBag,
  Star,
  Utensils,
  Wallet,
  Wine
} from "lucide-react";

const iconMap = {
  "badge-yen-sign": CircleDollarSign,
  "banknote-arrow-down": BanknoteArrowDown,
  beef: Beef,
  "briefcase-business": BriefcaseBusiness,
  "bus-front": BusFront,
  "circle-dollar-sign": CircleDollarSign,
  "credit-card": CreditCard,
  fuel: Fuel,
  gift: Gift,
  "hand-coins": HandCoins,
  home: Home,
  landmark: Landmark,
  plane: Plane,
  "receipt-text": ReceiptText,
  shirt: Shirt,
  "shopping-bag": ShoppingBag,
  star: Star,
  utensils: Utensils,
  wallet: Wallet,
  wine: Wine
};

interface CategoryIconProps {
  icon: keyof typeof iconMap | string;
  color: string;
  label?: string | undefined;
  size?: "sm" | "md" | "lg" | undefined;
}

export function CategoryIcon({ icon, color, label, size = "md" }: CategoryIconProps) {
  const Icon = iconMap[icon as keyof typeof iconMap] ?? Star;

  return (
    <span aria-label={label} className={`category-icon category-icon--${size}`} style={{ background: color }}>
      <Icon aria-hidden="true" />
    </span>
  );
}
