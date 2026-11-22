import React from 'react';

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '14px',
        marginTop: '12px',
      }}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px',
            display: 'grid',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ height: '18px', width: '52%', background: '#e2e8f0', borderRadius: '6px' }} />
            <div style={{ height: '20px', width: '26%', background: '#e2e8f0', borderRadius: '999px' }} />
          </div>
          <div style={{ height: '13px', width: '68%', background: '#f1f5f9', borderRadius: '6px' }} />
          <div style={{ height: '13px', width: '45%', background: '#f1f5f9', borderRadius: '6px' }} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <div style={{ height: '30px', width: '64px', background: '#e2e8f0', borderRadius: '8px' }} />
            <div style={{ height: '30px', width: '96px', background: '#e2e8f0', borderRadius: '8px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: '8px', padding: '12px 0' }}>
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          style={{
            height: '42px',
            background: idx % 2 === 0 ? '#f1f5f9' : '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        />
      ))}
    </div>
  );
}