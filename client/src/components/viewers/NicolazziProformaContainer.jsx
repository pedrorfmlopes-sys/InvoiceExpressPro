import React, { useState } from 'react';
import NicolazziProformaViewer from './NicolazziProformaViewer';
import NicolazziGoldViewer from './NicolazziGoldViewer';

/**
 * NicolazziProformaContainer
 * Handles toggling between Modern and Gold viewers for Nicolazzi Proformas.
 */
export default function NicolazziProformaContainer(props) {
    const [viewType, setViewType] = useState('modern'); // 'modern' or 'classic'

    const toggleViewer = () => {
        setViewType(prev => prev === 'modern' ? 'classic' : 'modern');
    };

    if (viewType === 'classic') {
        return (
            <NicolazziGoldViewer
                {...props}
                onSwitch={toggleViewer}
                viewerType="classic"
            />
        );
    }

    return (
        <NicolazziProformaViewer
            {...props}
            onSwitch={toggleViewer}
            viewerType="modern"
        />
    );
}
