import { motion } from 'framer-motion';
import { ONION_IMAGE } from '../utils/game';

export const OnionRain = () => {
    const onions = Array.from({ length: 100 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 0.5 + Math.random() * 1.5,
        size: 30 + Math.random() * 100,
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-50 rounded-sm">
            {onions.map((o) => (
                <motion.img
                    key={o.id}
                    src={ONION_IMAGE}
                    initial={{ y: -150, opacity: 1, rotate: 0 }}
                    animate={{ y: 800, rotate: 720 }}
                    transition={{
                        duration: o.duration,
                        repeat: Infinity,
                        delay: o.delay,
                        ease: "linear"
                    }}
                    className="absolute object-contain opacity-100"
                    style={{
                        left: `${o.left}%`,
                        width: `${o.size}px`,
                        height: `${o.size}px`
                    }}
                />
            ))}
        </div>
    );
};
