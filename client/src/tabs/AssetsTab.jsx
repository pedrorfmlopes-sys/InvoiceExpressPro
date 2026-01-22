import React from 'react';
import AssetManager from '../components/system/AssetManager';

export default function AssetsTab() {
    return (
        <div className="flex flex-col h-full overflow-hidden p-6 fade-in">
            <div className="h-full">
                <AssetManager />
            </div>
        </div>
    );
}
