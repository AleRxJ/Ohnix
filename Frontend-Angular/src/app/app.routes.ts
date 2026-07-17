import { Routes } from '@angular/router';
import { landingRouteGuard } from './core/guards/landing-route.guard';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
	{
		path: '',
		canMatch: [landingRouteGuard],
		loadComponent: () => import('./pages/landing-page.component').then((m) => m.LandingPageComponent)
	},
	{
		path: 'login',
		loadComponent: () => import('./pages/login-page.component').then((m) => m.LoginPageComponent)
	},
	{
		path: 'signup',
		loadComponent: () => import('./pages/signup-page.component').then((m) => m.SignupPageComponent)
	},
	{
		path: 'reset-password',
		loadComponent: () => import('./pages/reset-password-page.component').then((m) => m.ResetPasswordPageComponent)
	},
	{
		path: 'email-verify',
		canMatch: [authGuard],
		loadComponent: () => import('./pages/email-verify-page.component').then((m) => m.EmailVerifyPageComponent)
	},
	{
		path: 'profile',
		canMatch: [authGuard],
		loadComponent: () => import('./pages/profile-page.component').then((m) => m.ProfilePageComponent)
	},
	{
		path: 'dashboard',
		canMatch: [authGuard],
		loadComponent: () => import('./layout/dashboard-shell.component').then((m) => m.DashboardShellComponent),
		children: [
			{
				path: '',
				pathMatch: 'full',
				redirectTo: 'overview'
			},
			{
				path: 'overview',
				loadComponent: () => import('./pages/dashboard-page.component').then((m) => m.DashboardPageComponent)
			},
			{
				path: 'products',
				loadComponent: () => import('./pages/products-page.component').then((m) => m.ProductsPageComponent)
			},
			{
				path: 'orders',
				loadComponent: () => import('./pages/module-page.component').then((m) => m.ModulePageComponent),
				data: { title: 'Orders', description: 'Track sales orders and invoice flows.', endpoint: '/orders' }
			},
			{
				path: 'purchases',
				loadComponent: () => import('./pages/module-page.component').then((m) => m.ModulePageComponent),
				data: { title: 'Purchases', description: 'Create and manage purchase orders.', endpoint: '/purchases' }
			},
			{
				path: 'customers',
				loadComponent: () => import('./pages/module-page.component').then((m) => m.ModulePageComponent),
				data: { title: 'Customers', description: 'Customer profiles and relationship data.', endpoint: '/customers' }
			},
			{
				path: 'suppliers',
				loadComponent: () => import('./pages/module-page.component').then((m) => m.ModulePageComponent),
				data: { title: 'Suppliers', description: 'Supplier contacts and banking details.', endpoint: '/suppliers' }
			},
			{
				path: 'categories',
				loadComponent: () => import('./pages/module-page.component').then((m) => m.ModulePageComponent),
				data: { title: 'Categories', description: 'Organize the product taxonomy.', endpoint: '/categories/user' }
			},
			{
				path: 'reports',
				loadComponent: () => import('./pages/module-page.component').then((m) => m.ModulePageComponent),
				data: { title: 'Reports', description: 'Analytics, sales, stock and performance views.', endpoint: '/reports/stock' }
			}
		]
	},
	{
		path: 'demo',
		loadComponent: () => import('./pages/demo-page.component').then((m) => m.DemoPageComponent)
	},
	{
		path: '**',
		loadComponent: () => import('./pages/not-found-page.component').then((m) => m.NotFoundPageComponent)
	}
];
