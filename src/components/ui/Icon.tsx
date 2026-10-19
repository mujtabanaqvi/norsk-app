import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/** Thin wrapper around Ionicons with theme defaults. */
export const Icon: React.FC<IconProps> = ({ name, size = 20, color = colors.text }) => (
  <Ionicons name={name} size={size} color={color} />
);

