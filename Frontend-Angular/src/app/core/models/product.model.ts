export interface Category {
  _id: string;
  category_name: string;
}

export interface Unit {
  _id: string;
  unit_name: string;
}

export interface Product {
  _id: string;
  product_name: string;
  product_code: string;
  product_image?: string;
  stock: number;
  buying_price: number;
  selling_price: number;
  category_id: Category;
  unit_id: Unit;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductApiResponse {
  success: boolean;
  message?: string;
  data: Product[] | Product;
}