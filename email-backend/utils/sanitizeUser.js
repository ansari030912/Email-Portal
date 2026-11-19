const { requiresTwoFactor } = require("../config/constants");

// The only user fields ever sent to the frontend.
const toPublicUser = (user) => {
  if (!user) return null;
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isBlocked: !!user.isBlocked,
    isTwoFactorEnabled: !!user.isTwoFactorEnabled,
    twoFactorRequired: requiresTwoFactor(user),
    twoFactorEnabledAt: user.twoFactorEnabledAt || null,
    mailAccountId: user.mailAccountId || null,
    mailAccountEmail: user.mailAccountEmail || null,
    lastLoginAt: user.lastLoginAt || null,
    passwordChangedAt: user.passwordChangedAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

module.exports = { toPublicUser };
