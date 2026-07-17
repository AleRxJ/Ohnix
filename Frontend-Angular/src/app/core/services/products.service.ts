import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Category, Product, ProductApiResponse, Unit } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly api = inject(ApiService);

  listProducts(filters: { search?: string; category?: string | null; stockFilter?: string | null } = {}) {
    const params = new URLSearchParams();

    if (filters.search) params.set('search', filters.search);
    if (filters.category) params.set('category', filters.category);
    if (filters.stockFilter === 'out') params.set('max_stock', '0');
    if (filters.stockFilter === 'low') {
      params.set('min_stock', '1');
      params.set('max_stock', '10');
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.api.get<ProductApiResponse>(`/products${query}`);
  }

  createProduct(formData: FormData) {
    return this.api.post<ProductApiResponse>('/products', formData);
  }

  updateProduct(productId: string, formData: FormData) {
    return this.api.patch<ProductApiResponse>(`/products/${productId}`, formData);
  }

  deleteProduct(productId: string) {
    return this.api.delete<ProductApiResponse>(`/products/${productId}`);
  }

  bulkUpload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<any>('/products/bulk-upload', formData);
  }

  listCategories() {
    return this.api.get<{ success: boolean; data: Category[] }>('/categories/available');
  }

  listUnits() {
    return this.api.get<{ success: boolean; data: Unit[] }>('/units');
  }
}