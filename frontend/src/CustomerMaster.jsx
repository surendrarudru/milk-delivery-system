import { useEffect, useState } from 'react'
import DeliveryHistory from './DeliveryHistory'
import CustomerPayments from './CustomerPayments'
import CustomerLedger from './CustomerLedger'
import './CustomerMaster.css'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://milk-delivery-api-bn26.onrender.com')


function CustomerMaster() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const [showProfile, setShowProfile] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [activeTab, setActiveTab] = useState('details')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // CUSTOMER CARD BALANCE STATES
  const [cardBalances, setCardBalances] = useState({})
  const [balanceLoading, setBalanceLoading] = useState(false)

  // MONTHLY BILL STATES
  const [billHistory, setBillHistory] = useState([])
  const [billLoading, setBillLoading] = useState(false)
  const [billError, setBillError] = useState('')
  const [selectedBill, setSelectedBill] = useState(null)
  const [billDetailLoading, setBillDetailLoading] = useState(false)

  // EMPTY CUSTOMER FORM
  const emptyForm = {
    CustomerCode: '',
    CustomerName: '',
    ReferenceName: '',
    MobileNumber: '',
    Address: '',
    MilkRate: 100,
    VennaPusaRate: 1000,
    MorningDelivery: false,
    EveningDelivery: false,
    WhatsAppAvailable: false,
    DefaultMilkQuantity: '',
    IsActive: true
  }

  const [formData, setFormData] = useState({ ...emptyForm })

  // LOAD ALL CUSTOMER CARD BALANCES
  async function loadCustomerCardBalances(customerList = customers) {
    if (!customerList.length) {
      setCardBalances({})
      return
    }

    setBalanceLoading(true)

    try {
      const results = await Promise.all(
        customerList.map(async customer => {
          try {
            const response = await fetch(
              `${API_URL}/customers/${customer.CustomerID}/card-balance`
            )

            if (!response.ok) {
              throw new Error('Balance load failed')
            }

            const data = await response.json()

            return [customer.CustomerID, data]
          } catch (err) {
            console.error(
              `Balance failed for Customer ${customer.CustomerID}:`,
              err
            )

            return [customer.CustomerID, null]
          }
        })
      )

      setCardBalances(Object.fromEntries(results))
    } finally {
      setBalanceLoading(false)
    }
  }

  // LOAD CUSTOMERS (SINGLE FAST QUERY WITH BALANCES)
  async function loadCustomers() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/customers-summary`)
      if (!response.ok) {
        throw new Error('Customers load cheyyadam fail ayyindi')
      }
      const data = await response.json()
      const customerList = Array.isArray(data) ? data : []
      setCustomers(customerList)
      setCardBalances(Object.fromEntries(customerList.map(c => [c.CustomerID, c])))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  // REFRESH CUSTOMER BALANCE
  async function refreshCustomerBalance(customerId) {
    try {
      const response = await fetch(
        `${API_URL}/customers/${customerId}/card-balance`
      )

      if (!response.ok) {
        throw new Error('Customer balance refresh failed')
      }

      const data = await response.json()

      setCardBalances(previous => ({
        ...previous,
        [customerId]: data
      }))
    } catch (err) {
      console.error('Balance refresh failed:', err)
    }
  }

  // LOAD CUSTOMER BILL HISTORY
  async function loadBillHistory(customerId) {
    setBillLoading(true)
    setBillError('')
    setBillHistory([])
    setSelectedBill(null)

    try {
      const response = await fetch(
        `${API_URL}/customers/${customerId}/bills`
      )

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Bill history load failed')
      }

      const data = await response.json()

      setBillHistory(
        Array.isArray(data.Bills) ? data.Bills : []
      )
    } catch (err) {
      setBillError(err.message)
    } finally {
      setBillLoading(false)
    }
  }

  // LOAD INDIVIDUAL BILL
  async function loadBillDetails(billId) {
    setBillDetailLoading(true)
    setBillError('')
    setSelectedBill(null)

    try {
      const response = await fetch(
        `${API_URL}/billing/bill/${billId}`
      )

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Bill details load failed')
      }

      const data = await response.json()
      setSelectedBill(data)
    } catch (err) {
      setBillError(err.message)
    } finally {
      setBillDetailLoading(false)
    }
  }

  // OPEN CUSTOMER PROFILE
  function openProfile(customer) {
    setSelectedCustomer(customer)
    setActiveTab('details')
    setShowProfile(true)

    setBillHistory([])
    setSelectedBill(null)
    setBillError('')
  }

  // PROFILE TAB CHANGE
  function handleProfileTabChange(tab) {
    setActiveTab(tab)
    setSelectedBill(null)
    setBillError('')

    if (tab === 'bills' && selectedCustomer) {
      loadBillHistory(selectedCustomer.CustomerID)
    }

    if (tab === 'payments' && selectedCustomer) {
      refreshCustomerBalance(selectedCustomer.CustomerID)
    }
  }

  // OPEN ADD FORM
  function openAddForm() {
    setEditingCustomer(null)
    setFormData({ ...emptyForm })
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  // OPEN EDIT FORM
  function openEditForm(customer) {
    setEditingCustomer(customer)

    setFormData({
      CustomerCode: customer.CustomerCode || '',
      CustomerName: customer.CustomerName || '',
      ReferenceName: customer.ReferenceName || '',
      MobileNumber: customer.MobileNumber || '',
      Address: customer.Address || '',
      MilkRate: customer.MilkRate ?? 100,
      VennaPusaRate: customer.VennaPusaRate ?? 1000,
      MorningDelivery: Boolean(customer.MorningDelivery),
      EveningDelivery: Boolean(customer.EveningDelivery),
      WhatsAppAvailable: Boolean(customer.WhatsAppAvailable),
      DefaultMilkQuantity: customer.DefaultMilkQuantity ?? '',
      IsActive: Boolean(customer.IsActive)
    })

    setError('')
    setSuccess('')
    setShowForm(true)
  }

  // FORM INPUT HANDLER
  function handleChange(event) {
    const { name, value, type, checked } = event.target

    setFormData(previous => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  // SAVE CUSTOMER
  async function saveCustomer(event) {
    event.preventDefault()

    setError('')
    setSuccess('')

    if (!formData.MorningDelivery && !formData.EveningDelivery) {
      setError('At least one delivery session select cheyyali.')
      return
    }

    if (Number(formData.MilkRate) < 0) {
      setError('Milk Rate cannot be negative.')
      return
    }

    if (Number(formData.VennaPusaRate) < 0) {
      setError('Veena Pusa Rate cannot be negative.')
      return
    }

    if (
      formData.DefaultMilkQuantity !== '' &&
      Number(formData.DefaultMilkQuantity) < 0
    ) {
      setError('Default Milk Quantity cannot be negative.')
      return
    }

    const payload = {
      ...formData,
      MilkRate: Number(formData.MilkRate),
      VennaPusaRate: Number(formData.VennaPusaRate),
      DefaultMilkQuantity:
        formData.DefaultMilkQuantity === ''
          ? null
          : Number(formData.DefaultMilkQuantity)
    }

    try {
      setSaving(true)

      const wasEditing = Boolean(editingCustomer)

      const url = wasEditing
        ? `${API_URL}/customers/${editingCustomer.CustomerID}`
        : `${API_URL}/customers`

      const response = await fetch(url, {
        method: wasEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Customer save failed')
      }

      setShowForm(false)
      setEditingCustomer(null)
      setFormData({ ...emptyForm })

      await loadCustomers()

      setSuccess(
        wasEditing
          ? 'Customer updated successfully.'
          : 'Customer added successfully.'
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // SEARCH AND FILTER
  const filteredCustomers = customers.filter(customer => {
    const searchText = search.toLowerCase().trim()

    const matchesSearch =
      (customer.CustomerName || '').toLowerCase().includes(searchText) ||
      (customer.CustomerCode || '').toLowerCase().includes(searchText) ||
      (customer.ReferenceName || '').toLowerCase().includes(searchText) ||
      (customer.MobileNumber || '').toLowerCase().includes(searchText)

    let matchesFilter = true

    if (filter === 'Active') {
      matchesFilter = customer.IsActive === true
    } else if (filter === 'Inactive') {
      matchesFilter = customer.IsActive === false
    } else if (filter === 'Morning') {
      matchesFilter = customer.MorningDelivery === true
    } else if (filter === 'Evening') {
      matchesFilter = customer.EveningDelivery === true
    } else if (filter === 'Due') {
      const st = String(cardBalances[customer.CustomerID]?.PaymentStatus || '').toUpperCase()
      matchesFilter = st === 'DUE' || st === 'PARTIAL'
    }

    return matchesSearch && matchesFilter
  })

  // CUSTOMER COUNTS
  const activeCount = customers.filter(
    customer => customer.IsActive
  ).length

  const inactiveCount = customers.filter(
    customer => !customer.IsActive
  ).length

  const morningCount = customers.filter(
    customer => customer.MorningDelivery
  ).length

  const eveningCount = customers.filter(
    customer => customer.EveningDelivery
  ).length

  // FORMAT CURRENCY
  function formatCurrency(amount) {
    return Number(amount || 0).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    })
  }

  // FORMAT BILL MONTH
  function formatBillMonth(year, month) {
    return new Date(year, month - 1).toLocaleDateString(
      'en-IN',
      {
        month: 'long',
        year: 'numeric'
      }
    )
  }

  // RENDER CARD PAYMENT STATUS
  function renderCardPaymentStatus(customer) {
    const balance = cardBalances[customer.CustomerID]

    if (!balance) {
      return (
        <span className="card-payment-status unavailable">
          {balanceLoading ? 'Loading...' : 'Balance unavailable'}
        </span>
      )
    }

    const status = String(balance.PaymentStatus || '').toUpperCase()
    const amount = Number(balance.StatusAmount || 0)

    let statusClass = 'unavailable'
    let statusText = 'Balance unavailable'

    if (status === 'DUE') {
      statusClass = 'due'
      statusText = `${formatCurrency(amount)} DUE`
    } else if (status === 'PARTIAL') {
      statusClass = 'partial'
      statusText = `${formatCurrency(amount)} PARTIAL`
    } else if (status === 'NO DUE') {
      statusClass = 'no-due'
      statusText = 'NO DUE'
    } else if (status === 'ADVANCE') {
      statusClass = 'advance'
      statusText = `${formatCurrency(amount)} ADVANCE`
    }

    return (
      <span className={`card-payment-status ${statusClass}`}>
        {statusText}
      </span>
    )
  }

  // CUSTOMER CARD
  function renderCustomerCard(customer) {
    return (
      <div
        className="customer-card"
        key={customer.CustomerID}
        onClick={() => openProfile(customer)}
      >
        <div className="customer-card-header">
          <h3>{customer.CustomerName || 'Unnamed Customer'}</h3>

          {renderCardPaymentStatus(customer)}
        </div>

        <p>
          <strong>Customer ID:</strong>{' '}
          {customer.CustomerCode || '-'}
        </p>

        <p>
          <strong>Reference:</strong>{' '}
          {customer.ReferenceName || '-'}
        </p>

        <p>
          <strong>Mobile:</strong>{' '}
          {customer.MobileNumber ? (
            <a
              href={`tel:${customer.MobileNumber}`}
              onClick={event => event.stopPropagation()}
            >
              {customer.MobileNumber}
            </a>
          ) : '-'}
        </p>

        <div className="customer-shifts">
          {customer.MorningDelivery && (
            <span className="shift-badge morning">Morning</span>
          )}

          {customer.EveningDelivery && (
            <span className="shift-badge evening">Evening</span>
          )}

          {!customer.MorningDelivery &&
            !customer.EveningDelivery && (
              <span className="shift-badge">No Delivery</span>
            )}
        </div>

        <div className="customer-card-footer">
          <span
            className={
              customer.IsActive
                ? 'customer-status active'
                : 'customer-status inactive'
            }
          >
            {customer.IsActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="customer-card-actions">
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              openEditForm(customer)
            }}
          >
            Edit
          </button>

          <span>View Profile →</span>
        </div>
      </div>
    )
  }

  // ADD / EDIT CUSTOMER FORM
  function renderCustomerForm() {
    return (
      <div
        className="customer-modal-overlay"
        onClick={() => {
          if (!saving) setShowForm(false)
        }}
      >
        <div
          className="customer-modal"
          onClick={event => event.stopPropagation()}
        >
          <div className="customer-modal-header">
            <h2>
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              ✕
            </button>
          </div>

          <form onSubmit={saveCustomer}>
            <div className="customer-form-grid">

              <div className="form-group">
                <label>Customer Code *</label>
                <input
                  name="CustomerCode"
                  value={formData.CustomerCode}
                  onChange={handleChange}
                  required
                  disabled={Boolean(editingCustomer)}
                />
              </div>

              <div className="form-group">
                <label>Customer Name *</label>
                <input
                  name="CustomerName"
                  value={formData.CustomerName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Reference Name</label>
                <input
                  name="ReferenceName"
                  value={formData.ReferenceName}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Mobile Number</label>
                <input
                  type="tel"
                  name="MobileNumber"
                  value={formData.MobileNumber}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group full-width">
                <label>Address</label>
                <textarea
                  name="Address"
                  value={formData.Address}
                  onChange={handleChange}
                  rows="2"
                />
              </div>

              <div className="form-group">
                <label>Milk Rate (₹ / Litre) *</label>
                <input
                  type="number"
                  name="MilkRate"
                  value={formData.MilkRate}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="form-group">
                <label>Veena Pusa Rate (₹ / KG) *</label>
                <input
                  type="number"
                  name="VennaPusaRate"
                  value={formData.VennaPusaRate}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="form-group">
                <label>Default Milk Quantity (L)</label>
                <input
                  type="number"
                  name="DefaultMilkQuantity"
                  value={formData.DefaultMilkQuantity}
                  onChange={handleChange}
                  min="0"
                  step="0.25"
                />
              </div>

            </div>

            <div className="customer-form-section">
              <h4>Delivery Sessions</h4>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="MorningDelivery"
                  checked={formData.MorningDelivery}
                  onChange={handleChange}
                />
                Morning Delivery
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="EveningDelivery"
                  checked={formData.EveningDelivery}
                  onChange={handleChange}
                />
                Evening Delivery
              </label>
            </div>

            <div className="customer-form-section">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="WhatsAppAvailable"
                  checked={formData.WhatsAppAvailable}
                  onChange={handleChange}
                />
                WhatsApp Available
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="IsActive"
                  checked={formData.IsActive}
                  onChange={handleChange}
                />
                Active Customer
              </label>
            </div>

            {error && (
              <div className="customer-error">{error}</div>
            )}

            <div className="customer-form-actions">
              <button
                type="submit"
                className="save-btn"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingCustomer
                    ? 'Update Customer'
                    : 'Save Customer'}
              </button>

              <button
                type="button"
                className="cancel-btn"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // BILL DETAILS VIEW
  function renderBillDetails() {
    if (billDetailLoading) {
      return <p>Loading bill details...</p>
    }

    if (billError) {
      return <div className="customer-error">{billError}</div>
    }

    if (!selectedBill) return null

    return (
      <div className="bill-detail-view">

        <button
          type="button"
          className="cancel-btn"
          onClick={() => setSelectedBill(null)}
        >
          ← Back to Bill History
        </button>

        <div className="bill-detail-header">
          <div>
            <h3>
              {formatBillMonth(
                selectedBill.BillYear,
                selectedBill.BillMonth
              )}
            </h3>
            <p>Bill ID: {selectedBill.BillID}</p>
          </div>

          <span
            className={`bill-status ${
              selectedBill.BillStatus === 'Finalized'
                ? 'finalized'
                : 'generated'
            }`}
          >
            {selectedBill.BillStatus}
          </span>
        </div>

        <div className="bill-summary-grid">
          <div className="bill-summary-item">
            <span>Milk Total</span>
            <strong>{formatCurrency(selectedBill.MilkTotal)}</strong>
          </div>

          <div className="bill-summary-item">
            <span>Veena Pusa Total</span>
            <strong>{formatCurrency(selectedBill.VeenaPusaTotal)}</strong>
          </div>

          <div className="bill-summary-item">
            <span>Total Amount Due</span>
            <strong>{formatCurrency(selectedBill.TotalAmountDue)}</strong>
          </div>
        </div>

        <h4>Previous Balances</h4>

        <div className="bill-summary-grid">
          <div className="bill-summary-item">
            <span>Opening Balance</span>
            <strong>
              {formatCurrency(selectedBill.PreviousOpeningBalance)}
            </strong>
          </div>

          <div className="bill-summary-item">
            <span>Previous Milk Balance</span>
            <strong>
              {formatCurrency(selectedBill.PreviousMilkBalance)}
            </strong>
          </div>

          <div className="bill-summary-item">
            <span>Previous Veena Pusa Balance</span>
            <strong>
              {formatCurrency(selectedBill.PreviousVeenaPusaBalance)}
            </strong>
          </div>
        </div>

        <h4>Bill Items</h4>

        <div className="bill-table-wrapper">
          <table className="bill-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {(selectedBill.Items || []).map(item => (
                <tr key={item.BillDetailID}>
                  <td>{item.ItemType}</td>
                  <td>{item.TotalQuantity}</td>
                  <td>{formatCurrency(item.Rate)}</td>
                  <td>{formatCurrency(item.Amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    )
  }

  // MONTHLY BILL HISTORY
  function renderMonthlyBills() {
    return (
      <div className="monthly-bills-section">

        <div className="section-heading">
          <div>
            <h3>Monthly Bill History</h3>
            <p>
              {selectedCustomer.CustomerName} —{' '}
              {selectedCustomer.CustomerCode}
            </p>
          </div>

          <button
            type="button"
            className="cancel-btn"
            onClick={() => loadBillHistory(selectedCustomer.CustomerID)}
          >
            Refresh
          </button>
        </div>

        {billLoading ? (
          <p>Loading monthly bills...</p>
        ) : billError ? (
          <div className="customer-error">{billError}</div>
        ) : selectedBill ? (
          renderBillDetails()
        ) : billHistory.length === 0 ? (
          <div className="profile-placeholder">
            <h3>No Monthly Bills</h3>
            <p>No generated bills found for this customer.</p>
          </div>
        ) : (
          <>
            <p className="bill-count">
              Total Bills: {billHistory.length}
            </p>

            <div className="bill-history-list">
              {billHistory.map(bill => (
                <div
                  className="bill-history-card"
                  key={bill.BillID}
                >
                  <div className="bill-history-main">
                    <div>
                      <h4>
                        {formatBillMonth(
                          bill.BillYear,
                          bill.BillMonth
                        )}
                      </h4>
                      <span>Bill ID: {bill.BillID}</span>
                    </div>

                    <span
                      className={`bill-status ${
                        bill.BillStatus === 'Finalized'
                          ? 'finalized'
                          : 'generated'
                      }`}
                    >
                      {bill.BillStatus}
                    </span>
                  </div>

                  <div className="bill-history-amounts">
                    <div>
                      <span>Milk</span>
                      <strong>{formatCurrency(bill.MilkTotal)}</strong>
                    </div>

                    <div>
                      <span>Veena Pusa</span>
                      <strong>{formatCurrency(bill.VeenaPusaTotal)}</strong>
                    </div>

                    <div>
                      <span>Total Due</span>
                      <strong>{formatCurrency(bill.TotalAmountDue)}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="view-bill-btn"
                    onClick={() => loadBillDetails(bill.BillID)}
                  >
                    View Bill Details
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // CUSTOMER PROFILE
  function renderCustomerProfile() {
    if (!selectedCustomer) return null

    return (
      <div
        className="customer-modal-overlay"
        onClick={() => setShowProfile(false)}
      >
        <div
          className="customer-profile-modal"
          onClick={event => event.stopPropagation()}
        >
          <div className="customer-modal-header">
            <div>
              <h2>{selectedCustomer.CustomerName}</h2>
              <p>{selectedCustomer.CustomerCode}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowProfile(false)}
            >
              ✕
            </button>
          </div>

          <div className="customer-profile-tabs">
            <button
              className={activeTab === 'details' ? 'active' : ''}
              onClick={() => handleProfileTabChange('details')}
            >
              Customer Details
            </button>

            <button
              className={activeTab === 'delivery' ? 'active' : ''}
              onClick={() => handleProfileTabChange('delivery')}
            >
              Delivery History
            </button>

            <button
              className={activeTab === 'bills' ? 'active' : ''}
              onClick={() => handleProfileTabChange('bills')}
            >
              Monthly Bills
            </button>

            <button
              className={activeTab === 'payments' ? 'active' : ''}
              onClick={() => handleProfileTabChange('payments')}
            >
              Payments
            </button>

            <button
              className={activeTab === 'ledger' ? 'active' : ''}
              onClick={() => handleProfileTabChange('ledger')}
            >
              Customer Ledger
            </button>
          </div>

          <div className="customer-profile-content">

            {activeTab === 'details' && (
              <div className="profile-details">

                <div className="profile-detail-row">
                  <span>Customer Name</span>
                  <strong>{selectedCustomer.CustomerName || '-'}</strong>
                </div>

                <div className="profile-detail-row">
                  <span>Customer Code</span>
                  <strong>{selectedCustomer.CustomerCode || '-'}</strong>
                </div>

                <div className="profile-detail-row">
                  <span>Reference Name</span>
                  <strong>{selectedCustomer.ReferenceName || '-'}</strong>
                </div>

                <div className="profile-detail-row">
                  <span>Mobile Number</span>
                  <strong>
                    {selectedCustomer.MobileNumber ? (
                      <a href={`tel:${selectedCustomer.MobileNumber}`}>
                        {selectedCustomer.MobileNumber}
                      </a>
                    ) : '-'}
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>Address</span>
                  <strong>{selectedCustomer.Address || '-'}</strong>
                </div>

                <div className="profile-detail-row">
                  <span>Milk Rate</span>
                  <strong>{formatCurrency(selectedCustomer.MilkRate)}</strong>
                </div>

                <div className="profile-detail-row">
                  <span>Veena Pusa Rate</span>
                  <strong>{formatCurrency(selectedCustomer.VennaPusaRate)}</strong>
                </div>

                <div className="profile-detail-row">
                  <span>Default Milk Quantity</span>
                  <strong>
                    {selectedCustomer.DefaultMilkQuantity ?? '-'} L
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>Delivery Sessions</span>
                  <strong>
                    {[
                      selectedCustomer.MorningDelivery && 'Morning',
                      selectedCustomer.EveningDelivery && 'Evening'
                    ].filter(Boolean).join(', ') || '-'}
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>WhatsApp Available</span>
                  <strong>
                    {selectedCustomer.WhatsAppAvailable ? 'Yes' : 'No'}
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>Status</span>
                  <strong>
                    {selectedCustomer.IsActive ? 'Active' : 'Inactive'}
                  </strong>
                </div>

                <button
                  className="save-btn"
                  onClick={() => {
                    setShowProfile(false)
                    openEditForm(selectedCustomer)
                  }}
                >
                  Edit Customer Details
                </button>
              </div>
            )}

            {activeTab === 'delivery' && (
              <DeliveryHistory customer={selectedCustomer} />
            )}

            {activeTab === 'bills' && renderMonthlyBills()}

            {activeTab === 'payments' && (
              <CustomerPayments
                customer={selectedCustomer}
                onPaymentSaved={() =>
                  refreshCustomerBalance(selectedCustomer.CustomerID)
                }
              />
            )}

            {activeTab === 'ledger' && (
              <CustomerLedger customer={selectedCustomer} />
            )}

          </div>
        </div>
      </div>
    )
  }

  // MAIN CUSTOMER MASTER UI
  return (
    <div className="customer-master">

      <div className="customer-master-header">
        <div>
          <h2>Customer Master</h2>
          <p>Total Customers: {customers.length}</p>
        </div>

        <button
          className="add-customer-btn"
          onClick={openAddForm}
        >
          + Add Customer
        </button>
      </div>

      <div className="customer-summary-grid">
        <div className="customer-summary-card">
          <span>Total Customers</span>
          <h3>{customers.length}</h3>
        </div>

        <div className="customer-summary-card">
          <span>Active Customers</span>
          <h3>{activeCount}</h3>
        </div>

        <div className="customer-summary-card">
          <span>Inactive Customers</span>
          <h3>{inactiveCount}</h3>
        </div>

        <div className="customer-summary-card">
          <span>Morning Assignments</span>
          <h3>{morningCount}</h3>
        </div>

        <div className="customer-summary-card">
          <span>Evening Assignments</span>
          <h3>{eveningCount}</h3>
        </div>
      </div>

      <div className="customer-toolbar">
        <input
          type="text"
          placeholder="Search name, code, reference or mobile..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />

        <select
          value={filter}
          onChange={event => setFilter(event.target.value)}
        >
          <option value="All">All Customers</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Morning">Morning</option>
          <option value="Evening">Evening</option>
          <option value="Due">Pending Dues Only</option>

        </select>
      </div>

      {success && (
        <div className="customer-success">
          {success}
        </div>
      )}

      {error && (
        <div className="customer-error">
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading customers...</p>
      ) : filteredCustomers.length === 0 ? (
        <p className="no-customers">No customers found.</p>
      ) : (
        <div className="customer-grid">
          {filteredCustomers.map(renderCustomerCard)}
        </div>
      )}

      {showForm && renderCustomerForm()}

      {showProfile && renderCustomerProfile()}

    </div>
  )
}

export default CustomerMaster
