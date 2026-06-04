export default function OpsHomePage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Executive Dashboard
        </h2>
        <p className="text-gray-600">
          Your business at a glance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Revenue Today"
          value="0 MAD"
          subtitle="No orders yet"
        />
        <KpiCard
          title="Revenue Week"
          value="0 MAD"
          subtitle="Start tracking"
        />
        <KpiCard
          title="Estimated Profit"
          value="0 MAD"
          subtitle="--"
        />
        <KpiCard
          title="Margin"
          value="0%"
          subtitle="--"
        />
      </div>

      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">🚀 Phase 2: Orders Module - In Progress</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>Orders API created (create, list, detail, update)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>Data completeness checker</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>Profit/margin calculator</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-500">⏳</span>
            <span>Order creation UI (building...)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-500">⏳</span>
            <span>Order list UI (building...)</span>
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-gray-600 mb-2">
              <strong>Quick Test:</strong>
            </p>
            <a
              href="/ops/orders"
              className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              Go to Orders →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, subtitle }: { title: string, value: string, subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
        {title}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-500">
          {subtitle}
        </div>
      )}
    </div>
  )
}
