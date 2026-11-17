import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://milk-delivery-api-bn26.onrender.com')

function CustomerLedger({ customer }) {
  const [ledgerData, setLedgerData] = useState(null)
  const [accountFilter, setAccountFilter] = useState('All')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadLedger() {
    if (!customer?.CustomerID) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `${API_URL}/customers/${customer.CustomerID}/ledger`
      )

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Customer ledger load failed')
      }

      const data = await response.json()
      setLedgerData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLedger()
  }, [customer?.CustomerID])

  function formatDate(value) {
    if (!value) return '-'
    return new Date(value).toLocaleDateString('en-IN')
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    })
  }

  function formatBalanceLabel(amount) {
    const num = Number(amount || 0)
    if (num > 0) return `${formatCurrency(num)} Due`
    if (num < 0) return `${formatCurrency(Math.abs(num))} Advance`
    return '₹0.00 (Settled)'
  }

  function formatAccountName(accountType) {
    if (accountType === 'OpeningBalance') return 'Opening Balance'
    if (accountType === 'VeenaPusa') return 'Veena Pusa'
    return accountType || '-'
  }

  const transactions = Array.isArray(ledgerData?.Transactions)
    ? ledgerData.Transactions
    : []

  const filteredTransactions = transactions.filter(item => {
    if (accountFilter === 'All') return true
    return item.AccountType === accountFilter
  })

  const balances = ledgerData?.AccountBalances || {
    OpeningBalance: 0,
    Milk: 0,
    VeenaPusa: 0
  }

  return (
    <div className="monthly-bills-section">
      <div className="section-heading">
        <div>
          <h3>Customer Ledger</h3>
          <p>
            {customer?.CustomerName} — {customer?.CustomerCode}
          </p>
        </div>

        <button
          type="button"
          className="cancel-btn"
          onClick={loadLedger}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="customer-error">{error}</div>}

      {loading ? (
        <p>Loading ledger transactions...</p>
      ) : (
        <>
          {/* Account-wise Current Balances */}
          <div className="bill-summary-grid">
            <div className="bill-summary-item">
              <span>Opening Balance</span>
              <strong>{formatBalanceLabel(balances.OpeningBalance)}</strong>
            </div>

            <div className="bill-summary-item">
              <span>Milk Account</span>
              <strong>{formatBalanceLabel(balances.Milk)}</strong>
            </div>

            <div className="bill-summary-item">
              <span>Veena Pusa Account</span>
              <strong>{formatBalanceLabel(balances.VeenaPusa)}</strong>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="customer-toolbar" style={{ marginTop: '15px' }}>
            <select
              value={accountFilter}
              onChange={e => setAccountFilter(e.target.value)}
            >
              <option value="All">All Accounts ({transactions.length})</option>
              <option value="OpeningBalance">Opening Balance</option>
              <option value="Milk">Milk</option>
              <option value="VeenaPusa">Veena Pusa</option>
            </select>
          </div>

          {/* Transactions Table */}
          {filteredTransactions.length === 0 ? (
            <div className="profile-placeholder">
              <h3>No Ledger Transactions</h3>
              <p>No debit or credit records found for this filter.</p>
            </div>
          ) : (
            <div className="bill-table-wrapper">
              <table className="bill-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Account</th>
                    <th>Description</th>
                    <th>Debit (Due)</th>
                    <th>Credit (Paid)</th>
                    <th>Account Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map(row => (
                    <tr key={row.LedgerID}>
                      <td>#{row.LedgerID}</td>
                      <td>{formatDate(row.TransactionDate)}</td>
                      <td>
                        <span className="payment-mode-badge">
                          {row.TransactionType}
                        </span>
                      </td>
                      <td>{formatAccountName(row.AccountType)}</td>
                      <td>{row.Description || '-'}</td>
                      <td style={{ color: Number(row.DebitAmount) > 0 ? '#b42318' : '#64748b', fontWeight: 600 }}>
                        {Number(row.DebitAmount) > 0
                          ? formatCurrency(row.DebitAmount)
                          : '-'}
                      </td>
                      <td style={{ color: Number(row.CreditAmount) > 0 ? '#15803d' : '#64748b', fontWeight: 600 }}>
                        {Number(row.CreditAmount) > 0
                          ? formatCurrency(row.CreditAmount)
                          : '-'}
                      </td>
                      <td>
                        <strong>{formatBalanceLabel(row.Balance)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default CustomerLedger
