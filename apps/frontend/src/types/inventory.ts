import type { UserRole } from "@/types/auth";

export type SortOrder = "asc" | "desc";
export type ProductStatus = "active" | "inactive";
export type StockMovementType = "in" | "out";

export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductStaffDto {
  id: string;
  category: {
    id: string;
    name: string;
  };
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  currentStock: string;
  minimumStock: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductAdminDto extends ProductStaffDto {
  purchasePrice: string;
  sellingPrice: string;
}

export type ProductDto = ProductAdminDto | ProductStaffDto;

export interface StockMovementDto {
  id: string;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    status: ProductStatus;
  };
  type: StockMovementType;
  quantity: string;
  stockBefore: string;
  stockAfter: string;
  reason: string;
  notes: string | null;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface DashboardSummaryDto {
  activeProductCount: number;
  activeCategoryCount: number;
  lowStockCount: number;
  stockInCount: number;
  stockOutCount: number;
}

export interface DashboardLowStockProductDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
}

export interface DashboardRecentMovementDto {
  id: string;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  };
  type: StockMovementType;
  quantity: string;
  stockBefore: string;
  stockAfter: string;
  reason: string;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface DashboardOverviewDto {
  summary: DashboardSummaryDto;
  lowStockProducts: DashboardLowStockProductDto[];
  recentStockMovements: DashboardRecentMovementDto[];
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isAdminProductDto(
  product: ProductDto,
): product is ProductAdminDto {
  return "purchasePrice" in product && "sellingPrice" in product;
}
