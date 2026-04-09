import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'

function UploadFormPage({ onPredictionSuccess, theme, onToggleTheme }) {
  const [file, setFile] = useState(null)
  const [category, setCategory] = useState('')
  const [productName, setProductName] = useState('')
  const [channel, setChannel] = useState('ecommerce')
  const [costPrice, setCostPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!file) {
      setError('Please upload a CSV or Excel file.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('product_category', category)
    formData.append('product_name', productName)
    formData.append('market_type', channel === 'ecommerce' ? 'online' : 'offline')
    formData.append('cost_price', costPrice)
    formData.append('sell_price', sellPrice)
    setIsSubmitting(true)

    try {
      // Call Flask backend directly (no Vite proxy configured).
      const response = await fetch('http://127.0.0.1:5000/predict', {
        method: 'POST',
        body: formData,
      })

      let apiData = null
      try {
        apiData = await response.json()
      } catch {
        apiData = null
      }

      if (!response.ok) {
        const msg = apiData?.error || `Prediction request failed (HTTP ${response.status}).`
        throw new Error(msg)
      }

      onPredictionSuccess(apiData)
      navigate('/result')
    } catch (requestError) {
      setError(requestError.message || 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <h1>Product Prediction Input</h1>
        <button type="button" className="secondary-btn" onClick={onToggleTheme}>
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </button>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <label className="field">
          Upload CSV / Excel
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            required
          />
        </label>

        <label className="field">
          Product Category
          <input
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="e.g. Beverages"
            required
          />
        </label>

        <label className="field">
          Product Name
          <input
            type="text"
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            placeholder="e.g. Orange Juice 1L"
            required
          />
        </label>

        <label className="field">
          Cost Price (per unit)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={costPrice}
            onChange={(event) => setCostPrice(event.target.value)}
            placeholder="e.g. 10"
            required
          />
        </label>

        <label className="field">
          Sell Price (per unit)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={sellPrice}
            onChange={(event) => setSellPrice(event.target.value)}
            placeholder="e.g. 25"
            required
          />
        </label>

        <div className="toggle-row">
          <span>Store Type</span>
          <button
            type="button"
            className={`switch ${channel === 'ecommerce' ? 'on' : ''}`}
            onClick={() =>
              setChannel((prev) => (prev === 'ecommerce' ? 'offline' : 'ecommerce'))
            }
          >
            <span className="thumb" />
          </button>
          <strong>{channel === 'ecommerce' ? 'Ecommerce' : 'Offline Store'}</strong>
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="primary-btn" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </main>
  )
}

function ResultPage({ resultData, theme, onToggleTheme }) {
  const location = useLocation()
  const dataFromRoute = location.state?.resultData
  const mergedData = useMemo(() => dataFromRoute || resultData || null, [dataFromRoute, resultData])
  const [activeHorizon, setActiveHorizon] = useState('month')

  if (!mergedData) {
    return <Navigate to="/" replace />
  }

  const activeForecastBlock = mergedData.forecasts?.[activeHorizon]
  const activeSummary = activeForecastBlock?.summary || {}
  const activeForecastRows = Array.isArray(activeForecastBlock?.forecast) ? activeForecastBlock.forecast : []
  const pieColors = ['#f59e0b', '#14b8a6'] // Cost, Profit

  const pieData = useMemo(() => {
    if (!activeForecastRows.length) return []
    const totals = activeForecastRows.reduce(
      (acc, row) => {
        acc.cost += Number(row.cost) || 0
        acc.profit += Number(row.profit) || 0
        return acc
      },
      { cost: 0, profit: 0 },
    )

    return [
      { name: 'Forecast Cost', value: Number(totals.cost) },
      { name: 'Forecast Profit', value: Number(totals.profit) },
    ]
  }, [activeForecastRows])

  const summaryItems = [
    { label: 'Previous (N days) Sales', value: activeSummary.previousWindowSales ?? '-' },
    { label: 'Forecast Sales', value: activeSummary.forecastSales ?? '-' },
    {
      label: 'Growth %',
      value: activeSummary.growthPercent != null ? `${activeSummary.growthPercent}%` : '-',
    },
    {
      label: 'Confidence',
      value: activeSummary.confidence != null ? `${activeSummary.confidence}%` : '-',
    },
    { label: 'Forecast Revenue', value: activeSummary.forecastRevenue ?? '-' },
  ]

  const timeSeriesData = useMemo(() => {
    const previous = Array.isArray(mergedData.previous) ? mergedData.previous : []

    const rows = []

    for (const point of previous) {
      if (!point?.date) continue
      rows.push({
        date: point.date,
        previous: Number(point.sales),
        forecast: null,
      })
    }

    for (const point of activeForecastRows) {
      if (!point?.date) continue
      rows.push({
        date: point.date,
        previous: null,
        forecast: Number(point.sales),
      })
    }

    rows.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))
    return rows
  }, [mergedData, activeForecastRows])

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>Prediction Result</h1>
          {(mergedData.product?.name || mergedData.product?.category) && (
            <p className="page-subtitle">
              {mergedData.product?.name || 'Unnamed product'}
              {mergedData.product?.category ? ` • ${mergedData.product.category}` : ''}
            </p>
          )}
        </div>
        <button type="button" className="secondary-btn" onClick={onToggleTheme}>
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </button>
      </header>

      <section className="summary-grid">
        {summaryItems.map((item, index) => (
          <motion.article
            key={item.label}
            className="card summary-item"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: index * 0.03 }}
          >
            <h3>{item.label}</h3>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={`${activeHorizon}-${item.label}-${String(item.value)}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {item.value}
              </motion.p>
            </AnimatePresence>
          </motion.article>
        ))}
      </section>

      <div className="horizon-toggle" role="tablist" aria-label="Forecast range">
        <motion.button
          type="button"
          className={`toggle-btn ${activeHorizon === 'week' ? 'active' : ''}`}
          onClick={() => setActiveHorizon('week')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {activeHorizon === 'week' && <motion.span className="toggle-highlight" layoutId="horizon-pill" />}
          Week
        </motion.button>
        <motion.button
          type="button"
          className={`toggle-btn ${activeHorizon === 'month' ? 'active' : ''}`}
          onClick={() => setActiveHorizon('month')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {activeHorizon === 'month' && (
            <motion.span className="toggle-highlight" layoutId="horizon-pill" />
          )}
          Month
        </motion.button>
      </div>

      <section className="charts-grid">
        <motion.article
          className="card chart-card chart-main"
          key={`line-${activeHorizon}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          <h3>Previous vs Forecast Sales ({activeHorizon === 'week' ? 'Week' : 'Month'})</h3>
          <ResponsiveContainer width="100%" height={340}>
            {timeSeriesData.length > 0 ? (
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Previous"
                  stroke="var(--chart-previous)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive
                  animationDuration={650}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast"
                  stroke="var(--chart-forecast)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive
                  animationDuration={700}
                />
              </LineChart>
            ) : null}
          </ResponsiveContainer>
        </motion.article>

        <motion.article
          className="card chart-card chart-side"
          key={`pie-${activeHorizon}`}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28 }}
        >
          <h3>Forecast Breakdown</h3>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={108}
                label
                isAnimationActive
                animationDuration={700}
              >
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </motion.article>
      </section>

      <section className="table-section">
        <article className="card">
          <h3 className="table-title">Forecast Details</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Sales</th>
                  <th className="num">Revenue</th>
                  <th className="num">Cost</th>
                  <th className="num">Profit</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false} mode="popLayout">
                  {activeForecastRows.map((row) => (
                    <motion.tr
                      key={`${activeHorizon}-${row.date}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      layout
                    >
                      <td>{row.date}</td>
                      <td className="num">{row.sales ?? '-'}</td>
                      <td className="num">{row.revenue ?? '-'}</td>
                      <td className="num">{row.cost ?? '-'}</td>
                      <td className="num">{row.profit ?? '-'}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
              <tfoot>
                {(() => {
                  const rows = activeForecastRows
                  const totals = rows.reduce(
                    (acc, r) => {
                      acc.sales += Number(r.sales) || 0
                      acc.revenue += Number(r.revenue) || 0
                      acc.cost += Number(r.cost) || 0
                      acc.profit += Number(r.profit) || 0
                      return acc
                    },
                    { sales: 0, revenue: 0, cost: 0, profit: 0 },
                  )

                  return (
                    <tr>
                      <th>Total</th>
                      <th className="num">{totals.sales.toFixed(0)}</th>
                      <th className="num">{totals.revenue.toFixed(2)}</th>
                      <th className="num">{totals.cost.toFixed(2)}</th>
                      <th className="num">{totals.profit.toFixed(2)}</th>
                    </tr>
                  )
                })()}
              </tfoot>
            </table>
          </div>
        </article>
      </section>
    </main>
  )
}

function App() {
  const [resultData, setResultData] = useState(null)
  const [theme, setTheme] = useState('light')

  return (
    <div className={`app ${theme}`}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <UploadFormPage
                onPredictionSuccess={setResultData}
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'))
                }
              />
            }
          />
          <Route
            path="/result"
            element={
              <ResultPage
                resultData={resultData}
                theme={theme}
                onToggleTheme={() =>
                  setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'))
                }
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
