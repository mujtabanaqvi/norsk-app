import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Card, Button } from './ui';
import { useLocale } from '../hooks/useLocale';
import { localizedUrl, openExternalUrl, openSupportEmail, usePublicLinks } from '../lib/public-links';
import { colors, space, type } from '../theme';

/** Bottom of the Terms / Privacy screens: link to the full document on the website, and the support address. */
export const LegalContactCard: React.FC<{ document: 'terms' | 'privacy' }> = ({ document }) => {
  const { t, locale } = useLocale();
  const links = usePublicLinks();
  const url = document === 'terms' ? links.termsUrl : links.privacyUrl;
  const [before, after = ''] = t('legal.contact').split('{email}');

  return (
    <Card style={styles.card}>
      <Button
        title={t('legal.readFull')}
        variant="outline"
        size="sm"
        iconRight="open-outline"
        onPress={() => openExternalUrl(localizedUrl(url, locale))}
      />
      <Text style={styles.paragraph}>
        {before}
        <Text
          style={styles.link}
          accessibilityRole="link"
          onPress={() => openSupportEmail(locale, links.supportEmail)}
        >
          {links.supportEmail}
        </Text>
        {after}
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    alignItems: 'flex-start',
  },
  paragraph: {
    ...type.body,
  },
  link: {
    color: colors.red,
    fontWeight: '600',
  },
});
