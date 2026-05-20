import React from 'react'
const Placeholder = ({ name }) => (
  <div className="card">
    <h2>{name} Module</h2>
    <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>Implementing {name} management features...</p>
  </div>
)
export default Placeholder
