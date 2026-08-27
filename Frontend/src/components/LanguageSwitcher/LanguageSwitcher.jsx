import React, { useContext } from 'react';
import { Select } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import useI18n from '../../hooks/useI18n';
import AuthContext from '../../context/AuthContext';
import { userService } from '../../services/userService';
import './LanguageSwitcher.css';

const LanguageSwitcher = () => {
  const { authenticated, refreshUser } = useContext(AuthContext);
  const { currentLanguage, changeLanguage, availableLanguages, languageNames } = useI18n();

  const handleLanguageChange = async (value) => {
    changeLanguage(value);

    if (!authenticated) {
      return;
    }

    try {
      await userService.updatePreferredLanguage(value);
      await refreshUser();
    } catch (_) {
      // Keep the UI language change even if persistence fails.
    }
  };

  return (
    <div className="language-switcher">
      <Select
        value={currentLanguage}
        onChange={handleLanguageChange}
        className="ohnix-language-select"
        popupClassName="ohnix-language-dropdown"
        style={{ width: '132px' }}
        prefix={<GlobalOutlined />}
        options={availableLanguages.map((lang) => ({
          value: lang,
          label: languageNames[lang],
        }))}
      />
    </div>
  );
};

export default LanguageSwitcher;
