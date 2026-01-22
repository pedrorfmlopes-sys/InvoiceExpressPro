import React from 'react';

/**
 * ActionBar - Grid container for ActionCards.
 * Placed typically below the header and above the content table.
 */
export function ActionBar({ children, className = '' }) {
    return (
        <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 ${className}`}>
            {children}
        </div>
    );
}
