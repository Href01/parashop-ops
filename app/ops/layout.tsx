import { requireOpsAccess } from '@/lib/auth'

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-purple-600">Shine BOS</h1>

            <nav className="hidden md:flex gap-1">
              <NavLink href="/ops">Dashboard</NavLink>
              <NavLink href="/ops/orders">Orders</NavLink>
              <NavLink href="/ops/products">Products</NavLink>
              <NavLink href="/ops/campaigns">Campaigns</NavLink>
              <NavLink href="/ops/content">Content</NavLink>
              <NavLink href="/ops/work-hub">Work Hub</NavLink>
            </nav>
          </div>

          <div className="text-sm text-gray-600">
            Founders Only
          </div>
        </div>
      </header>

      <main>
        {children}
      </main>
    </div>
  )
}

function NavLink({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
    >
      {children}
    </a>
  )
}
