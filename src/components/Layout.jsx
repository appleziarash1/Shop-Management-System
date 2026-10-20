import React, { useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Receipt,
  Truck, 
  Users, 
  Building2, 
  BarChart3, 
  Briefcase,
  LogOut,
  Bell,
  AlertCircle,
  PhoneCall,
  Shield,
  Menu,
  X,
  Settings,
  CheckCircle,
  ClipboardList
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import ErrorBoundary from './ErrorBoundary'

import { useShop } from '../context/ShopContext'
import { confirmAction } from '../lib/dialogs'
import managerLogo from '../assets/manager.png'
import ShopMessages from './ShopMessages'

const Layout = () => {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const { shops, currentShop, setCurrentShop, userProfile, lowStockItems, dueSalaries, currentShopAccess, successMessage, logout } = useShop();
  const avatarUrl = userProfile?.avatar_url;
  const avatarFallback = (userProfile?.full_name || 'AD').substring(0, 2).toUpperCase();
  // New state to control bottom navigation visibility on scroll
  const [showBottomNav, setShowBottomNav] = React.useState(true);
  const [isBottomNavCollapsed, setIsBottomNavCollapsed] = React.useState(false);
  const lastScrollY = React.useRef(0);
  React.useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 100) {
        // Scrolling down
        setShowBottomNav(false);
      } else {
        // Scrolling up
        setShowBottomNav(true);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Current shop selection is handled by ShopContext initial fetch
  }, [currentShop])

  const handleLogout = async () => {
    try {
      const confirmed = await confirmAction('Are you sure you want to log out of the system?')
      if (!confirmed) return
      
      await logout()
      // Fallback navigation in case ProtectedRoute doesn't trigger immediately
      navigate('/login', { replace: true })
    } catch (e) {
      console.error('Logout error:', e)
    }
  }

  return (
    <div className="app-container">
      {/* Global Success Notification */}
      {successMessage && (
        <div style={{ 
          position: 'fixed', 
          top: '24px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          zIndex: 9999, 
          animation: 'slideDown 0.4s ease-out' 
        }}>
          <div style={{ 
            background: '#2dce89', 
            color: 'white', 
            padding: '12px 24px', 
            borderRadius: '50px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            boxShadow: '0 10px 25px rgba(45, 206, 137, 0.3)',
            fontWeight: '600',
            fontSize: '15px'
          }}>
            <CheckCircle size={20} />
            {successMessage}
          </div>
          <style>{`
            @keyframes slideDown {
              from { transform: translate(-50%, -100%); opacity: 0; }
              to { transform: translate(-50%, 0); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'show' : ''}`} 
        onClick={() => setIsSidebarOpen(false)} 
      />
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src={managerLogo} alt="ShopMS" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>ShopMS</span>
          </div>
          <button 
            className="mobile-hide" 
            onClick={() => setIsSidebarOpen(false)}
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={24} />
          </button>
        </div>
        <nav>
          <ul className="nav-links">
            {[
              { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
              { to: '/inventory', icon: Package, label: 'Inventory' },
              { to: '/sales', icon: ShoppingCart, label: 'Sales' },
              { to: '/customers', icon: Users, label: 'Customers' },
              { to: '/expenses', icon: Receipt, label: 'Expenses' },
            ].map((link) => (
              <li key={link.to}>
                <NavLink 
                  to={link.to} 
                  onClick={() => setIsSidebarOpen(false)}
                  className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
                >
                  <link.icon size={20} />
                  <span>{link.label}</span>
                </NavLink>
              </li>
            ))}
            
            {userProfile?.role === 'Owner' && [
              { to: '/purchases',  icon: Truck,          label: 'Purchases' },
              { to: '/suppliers',  icon: Building2,       label: 'Suppliers' },
              { to: '/reports',    icon: BarChart3,       label: 'Reports' },
              { to: '/shops',      icon: Building2,       label: 'Shops' },
              { to: '/staff',      icon: Shield,          label: 'Staff' },
              { to: '/services',   icon: Briefcase,       label: 'Services' },
              { to: '/credit',     icon: PhoneCall,       label: 'Customer Credit' },
              { to: '/deliveries', icon: Truck,           label: 'Deliveries' },
              { to: '/audit',      icon: ClipboardList,   label: 'Audit Trail' },
              { to: '/settings',   icon: Settings,        label: 'Settings' },
            ].map((link) => (
              <li key={link.to}>
                <NavLink 
                  to={link.to} 
                  onClick={() => setIsSidebarOpen(false)}
                  className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
                >
                  <link.icon size={20} />
                  <span>{link.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <button onClick={handleLogout} className="nav-link" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                className="mobile-only" 
                onClick={() => setIsSidebarOpen(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '4px' }}
              >
                <Menu size={28} />
              </button>
              <div>
                <div className="mobile-stack" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h2 style={{ fontSize: '20px', margin: 0, fontWeight: '700' }}>{currentShop?.name || 'Loading Shop...'}</h2>
                  {userProfile?.role === 'Owner' && shops.length > 1 && (
                    <div style={{ position: 'relative' }}>
                      <select 
                        value={currentShop?.id} 
                        onChange={(e) => {
                          if (e.target.value === 'all') {
                            setCurrentShop({ id: 'all', name: 'Global Dashboard', location: 'All Shops Consolidated' })
                          } else {
                            setCurrentShop(shops.find(s => s.id === e.target.value))
                          }
                        }}
                        style={{ 
                          appearance: 'none', 
                          background: 'var(--primary)', 
                          color: 'white', 
                          padding: '6px 28px 6px 14px', 
                          borderRadius: '20px', 
                          border: 'none', 
                          fontSize: '12px', 
                          fontWeight: '600', 
                          cursor: 'pointer', 
                          outline: 'none',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                        }}
                      >
                        <option value="all">🌐 Global (All Shops)</option>
                        {shops.map(shop => (
                          <option key={shop.id} value={shop.id}>📍 {shop.name}</option>
                        ))}
                      </select>
                      <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'white', fontSize: '10px' }}>▼</div>
                    </div>
                  )}
                </div>
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13px' }}>{currentShop?.location || userProfile?.country_residence || 'Bangladesh'}</p>
                {currentShop?.id && currentShop.id !== 'all' && (
                  <p style={{ color: currentShopAccess.canModify ? 'var(--success)' : 'var(--danger)', fontSize: '11px', margin: '2px 0 0' }}>
                    {currentShopAccess.statusLabel}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ textAlign: 'right', marginRight: '8px' }} className="mobile-hide">
                <p style={{ fontWeight: '600', fontSize: '14px' }}>{userProfile?.full_name || 'Admin User'}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{userProfile?.role || 'Owner'}</p>
              </div>
              <div style={{ position: 'relative' }}>
                <button 
                  className="btn mobile-hide" 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', padding: '8px', position: 'relative' }}
                >
                  <Bell size={20} />
                  {(lowStockItems.length > 0 || (dueSalaries && dueSalaries.length > 0)) && (
                    <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '12px', height: '12px', background: 'var(--danger)', borderRadius: '50%', border: '2px solid white' }}></span>
                  )}
                </button>
                
                {isNotificationsOpen && (
                  <div className="card" style={{ position: 'absolute', top: '100%', right: 0, width: '300px', zIndex: 100, marginTop: '12px', padding: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 'bold' }}>Notifications</h4>
                      <span style={{ fontSize: '12px', padding: '2px 6px', background: 'var(--danger)', color: 'white', borderRadius: '10px' }}>{lowStockItems.length + (dueSalaries ? dueSalaries.length : 0)} Alerts</span>
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {lowStockItems.length === 0 && (!dueSalaries || dueSalaries.length === 0) ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No new notifications</p>
                      ) : (
                        <>
                          {dueSalaries && dueSalaries.map(salary => (
                            <div key={salary.id} onClick={() => { navigate('/staff'); setIsNotificationsOpen(false) }} style={{ display: 'flex', gap: '12px', padding: '8px', borderRadius: '8px', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.2)', cursor: 'pointer' }}>
                              <div style={{ color: 'var(--warning-strong)' }}><Briefcase size={16} /></div>
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>Salary Due: {salary.staff_name}</p>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Amount: {salary.amount} | Shop: {salary.shops?.name}</p>
                              </div>
                            </div>
                          ))}
                          {lowStockItems.map(item => (
                            <div key={item.id} onClick={() => { navigate('/inventory'); setIsNotificationsOpen(false) }} style={{ display: 'flex', gap: '12px', padding: '8px', borderRadius: '8px', background: 'var(--surface-danger-soft)', border: '1px solid var(--border-danger-soft)', cursor: 'pointer' }}>
                              <div style={{ color: 'var(--danger)' }}><AlertCircle size={16} /></div>
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: '600' }}>{item.name} is Low</p>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Stock: {item.quantity} | Shop: {item.shops?.name}</p>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={userProfile?.full_name || 'Profile'}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                  />
                ) : (
                  <div style={{ width: '40px', height: '40px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                    {avatarFallback}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="fade-in">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </section>
      </main>

      <nav className={`bottom-nav ${isSidebarOpen ? 'hidden-nav' : ''} ${showBottomNav && !isBottomNavCollapsed ? '' : 'hidden-nav'}`}>
        <button
          onClick={() => setIsBottomNavCollapsed(!isBottomNavCollapsed)}
          className="bottom-nav-toggle"
          title={isBottomNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          style={{
            position: 'absolute',
            top: '-24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--primary)',
            border: 'none',
            borderRadius: '12px 12px 0 0',
            padding: '6px 16px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            fontSize: '20px',
            transition: 'all 0.3s ease'
          }}
        >
          {isBottomNavCollapsed ? '▲' : '▼'}
        </button>

        {[
          { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
          { to: '/inventory', icon: Package, label: 'Stock' },
          { to: '/sales', icon: ShoppingCart, label: 'Sales' },
          { to: '/services', icon: Briefcase, label: 'Services' },
        ].map((link) => (
          <NavLink 
            key={link.to} 
            to={link.to} 
            className={({isActive}) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'}
          >
            <link.icon size={22} />
            <span>{link.label}</span>
          </NavLink>
        ))}
        {userProfile?.role === 'Owner' && (
          <NavLink 
            to="/reports" 
            className={({isActive}) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'}
          >
            <BarChart3 size={22} />
            <span>Reports</span>
          </NavLink>
        )}
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="bottom-nav-link"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Menu size={22} />
          <span>More</span>
        </button>
      </nav>

      {/* Floating collapse indicator when nav is hidden */}
      {!showBottomNav && !isBottomNavCollapsed && (
        <div
          onClick={() => setShowBottomNav(true)}
          className="nav-pull-indicator"
          style={{
            position: 'fixed',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--primary)',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            zIndex: 999,
            animation: 'pulse 2s infinite',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            transition: 'all 0.3s ease'
          }}
        >
          ↑ Tap to show navigation
        </div>
      )}

      {/* Floating Chat */}
      <ShopMessages />
    </div>
  )
}

export default Layout
