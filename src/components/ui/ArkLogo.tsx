import React from 'react';
import { motion } from 'framer-motion';

export const ArkLogo = ({ size = 100, className = '' }) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      initial={{ scale: 0.9 }}
      animate={{ 
        scale: [1, 1.05, 1],
        filter: [
          'drop-shadow(0 0 10px rgba(56,189,248,0.5))',
          'drop-shadow(0 0 25px rgba(56,189,248,0.8))',
          'drop-shadow(0 0 10px rgba(56,189,248,0.5))'
        ]
      }}
      transition={{ 
        duration: 4, 
        repeat: Infinity, 
        ease: "easeInOut" 
      }}
    >
      {/* Outer rotating rays */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "50px 50px" }}
      >
        {/* Sun rays represented by stylized petals/rays */}
        {[...Array(12)].map((_, i) => (
          <motion.path
            key={i}
            d="M48.5 12L50 2L51.5 12L50 22Z"
            fill="currentColor"
            transform={`rotate(${i * 30} 50 50)`}
            animate={{
              opacity: [0.6, 1, 0.6]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.1,
              ease: "easeInOut"
            }}
          />
        ))}
        {/* Smaller secondary rays */}
        {[...Array(12)].map((_, i) => (
          <motion.path
            key={`s-${i}`}
            d="M49 20L50 12L51 20L50 26Z"
            fill="currentColor"
            fillOpacity="0.5"
            transform={`rotate(${i * 30 + 15} 50 50)`}
          />
        ))}
      </motion.g>

      {/* Middle rotating dashed ring */}
      <motion.circle 
        cx="50" 
        cy="50" 
        r="34" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeOpacity="0.4" 
        strokeDasharray="4 8"
        animate={{ rotate: -360 }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "50px 50px" }}
      />

      {/* Center Sun Core */}
      <motion.circle
        cx="50"
        cy="50"
        r="24"
        fill="rgba(56,189,248,0.15)"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.8"
      />
      <motion.circle
        cx="50"
        cy="50"
        r="16"
        fill="currentColor"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.8, 1, 0.8]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* Inner glowing effect */}
      <motion.circle
        cx="50"
        cy="50"
        r="8"
        fill="rgba(255,255,255,0.8)"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Small floating particles around center */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "50px 50px" }}
      >
        <circle cx="50" cy="18" r="2.5" fill="currentColor" />
        <circle cx="50" cy="82" r="2.5" fill="currentColor" />
        <circle cx="18" cy="50" r="2.5" fill="currentColor" />
        <circle cx="82" cy="50" r="2.5" fill="currentColor" />
      </motion.g>
    </motion.svg>
  );
};
