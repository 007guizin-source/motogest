import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-center p-6">
      <div>
        <div className="text-6xl mb-4">🏍</div>
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-dark-300 mb-6">Página não encontrada.</p>
        <Link href="/dashboard">
          <span className="btn-primary cursor-pointer">Voltar ao Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
