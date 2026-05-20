import { useState } from 'react';

export function useModalState() {
  const [showCharModal, setShowCharModal] = useState(false);
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [showLogConsole, setShowLogConsole] = useState(false);
  const [showRegexModal, setShowRegexModal] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  return {
    showCharModal, setShowCharModal,
    showGlobalModal, setShowGlobalModal,
    showHistoryModal, setShowHistoryModal,
    showContextModal, setShowContextModal,
    showImageLibrary, setShowImageLibrary,
    showLogConsole, setShowLogConsole,
    showRegexModal, setShowRegexModal,
    showMobileSidebar, setShowMobileSidebar
  };
}
