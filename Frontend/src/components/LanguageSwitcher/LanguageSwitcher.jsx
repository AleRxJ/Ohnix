import React from 'react';
import { Select } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import useI18n from '../../hooks/useI18n';
import './LanguageSwitcher.css';

const LanguageSwitcher = () => {
  const { currentLanguage, changeLanguage, availableLanguages, languageNames } = useI18n();

  const handleLanguageChange = (value) => {
    changeLanguage(value);
  };

  return (
    <div className="language-switcher">
      <Select
        value={currentLanguage}
        onChange={handleLanguageChange}
        style={{ width: '120px' }}
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
