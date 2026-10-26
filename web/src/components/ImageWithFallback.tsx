import React, { useState } from 'react';
import './ImageWithFallback.css';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fallbackComponent?: React.ReactNode;
}

const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({ className, style, alt, ...props }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    return (
        <div className={`image-fallback-container ${className || ''}`} style={style}>
            {!isLoaded && !hasError && <div className="image-shimmer" style={{ borderRadius: style?.borderRadius }}></div>}
            <img
                {...props}
                alt={alt}
                style={style}
                className={`image-with-fallback ${isLoaded ? 'loaded' : ''}`}
                onLoad={(e) => {
                    setIsLoaded(true);
                    if (props.onLoad) props.onLoad(e);
                }}
                onError={(e) => {
                    setHasError(true);
                    if (props.onError) props.onError(e);
                }}
            />
        </div>
    );
};

export default ImageWithFallback;
