import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Flip · Projects',
    loadComponent: () => import('./projects/projects-page').then((m) => m.ProjectsPage),
  },
  {
    path: 'plan/:id',
    title: 'Flip · Editor',
    loadComponent: () => import('./editor/editor-page/editor-page').then((m) => m.EditorPage),
  },
  { path: '**', redirectTo: '' },
];
