import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Disparo Insta', description: 'Central de operações para contas profissionais do Instagram' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
