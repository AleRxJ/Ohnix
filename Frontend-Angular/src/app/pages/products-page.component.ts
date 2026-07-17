import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductsService } from '../core/services/products.service';
import { Category, Product, Unit } from '../core/models/product.model';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './products-page.component.html',
  styleUrl: './products-page.component.scss'
})
export class ProductsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly productsService = inject(ProductsService);

  readonly form = this.fb.nonNullable.group({
    product_name: ['', [Validators.required]],
    product_code: ['', [Validators.required]],
    category_id: ['', [Validators.required]],
    unit_id: ['', [Validators.required]],
    buying_price: [0, [Validators.required, Validators.min(0.01)]],
    selling_price: [0, [Validators.required, Validators.min(0.01)]]
  });

  products: Product[] = [];
  categories: Category[] = [];
  units: Unit[] = [];
  loading = true;
  saving = false;
  deletingId: string | null = null;
  searchText = '';
  categoryFilter = '';
  stockFilter = '';
  activeProduct: Product | null = null;
  imageFile: File | null = null;
  imagePreview = '';
  showModal = false;
  showBulk = false;
  showDetails = false;
  errorMessage = '';

  constructor() {
    this.loadInitialData();
  }

  loadInitialData() {
    this.loading = true;
    this.productsService.listCategories().subscribe({
      next: (response) => (this.categories = response.data ?? []),
      error: () => null
    });
    this.productsService.listUnits().subscribe({
      next: (response) => (this.units = response.data ?? []),
      error: () => null
    });
    this.refreshProducts();
  }

  refreshProducts() {
    this.loading = true;
    this.productsService
      .listProducts({
        search: this.searchText,
        category: this.categoryFilter || null,
        stockFilter: this.stockFilter || null
      })
      .subscribe({
        next: (response) => {
          this.products = Array.isArray(response.data) ? response.data : [];
          this.loading = false;
        },
        error: () => {
          this.products = [];
          this.loading = false;
        }
      });
  }

  applySearch() {
    this.refreshProducts();
  }

  resetFilters() {
    this.searchText = '';
    this.categoryFilter = '';
    this.stockFilter = '';
    this.refreshProducts();
  }

  openCreate() {
    this.activeProduct = null;
    this.imageFile = null;
    this.imagePreview = '';
    this.form.reset({
      product_name: '',
      product_code: '',
      category_id: '',
      unit_id: '',
      buying_price: 0,
      selling_price: 0
    });
    this.showModal = true;
  }

  openEdit(product: Product) {
    this.activeProduct = product;
    this.imageFile = null;
    this.imagePreview = product.product_image ?? '';
    this.form.reset({
      product_name: product.product_name,
      product_code: product.product_code,
      category_id: product.category_id?._id ?? '',
      unit_id: product.unit_id?._id ?? '',
      buying_price: product.buying_price,
      selling_price: product.selling_price
    });
    this.showModal = true;
  }

  openDetails(product: Product) {
    this.activeProduct = product;
    this.showDetails = true;
  }

  onImageChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.imageFile = file;

    if (file) {
      const reader = new FileReader();
      reader.onload = () => (this.imagePreview = String(reader.result ?? ''));
      reader.readAsDataURL(file);
    }
  }

  saveProduct() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formData = new FormData();
    Object.entries(this.form.getRawValue()).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    if (this.imageFile) {
      formData.append('product_image', this.imageFile);
    }

    this.saving = true;
    this.errorMessage = '';

    const request = this.activeProduct
      ? this.productsService.updateProduct(this.activeProduct._id, formData)
      : this.productsService.createProduct(formData);

    request.subscribe({
      next: (response) => {
        if (response.success) {
          this.showModal = false;
          this.activeProduct = null;
          this.refreshProducts();
        } else {
          this.errorMessage = response.message ?? 'Unable to save product';
        }
        this.saving = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message ?? 'Unable to save product';
        this.saving = false;
      }
    });
  }

  deleteProduct(product: Product) {
    this.deletingId = product._id;
    this.productsService.deleteProduct(product._id).subscribe({
      next: () => {
        this.refreshProducts();
        this.deletingId = null;
      },
      error: () => {
        this.deletingId = null;
      }
    });
  }

  closeModal() {
    if (this.saving) return;
    this.showModal = false;
  }

  closeDetails() {
    this.showDetails = false;
  }

  closeBulk() {
    this.showBulk = false;
  }

  uploadBulk(file: File | null) {
    if (!file) return;

    this.saving = true;
    this.productsService.bulkUpload(file).subscribe({
      next: () => {
        this.showBulk = false;
        this.saving = false;
        this.refreshProducts();
      },
      error: () => {
        this.saving = false;
      }
    });
  }

  handleBulkFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.uploadBulk(input.files?.[0] ?? null);
  }

  get stockBadge() {
    const stock = this.activeProduct?.stock ?? 0;
    if (stock === 0) return 'Out of Stock';
    if (stock <= 10) return 'Low Stock';
    return 'In Stock';
  }
}