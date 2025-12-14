const knex = require('../db/knex');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class UserService {
    async findByEmail(email) {
        return knex('users').where({ email }).first();
    }

    async findById(id) {
        return knex('users').where({ id }).first();
    }

    async createAdmin(email, password, name, orgName = 'Default Org') {
        const passwordHash = await bcrypt.hash(password, 10);

        return knex.transaction(async trx => {
            // User
            const userId = uuidv4();
            await trx('users').insert({
                id: userId,
                email,
                passwordHash,
                name: name || email.split('@')[0]
            });

            // Org
            const orgId = uuidv4();
            await trx('orgs').insert({
                id: orgId,
                name: orgName
            });

            // Membership
            await trx('memberships').insert({
                userId,
                orgId,
                role: 'admin'
            });

            // Subscription (Default to Pro for Admin to enable all features)
            await trx('subscriptions').insert({
                id: uuidv4(),
                orgId,
                planKey: 'pro',
                status: 'active'
            });

            return { userId, orgId, email, role: 'admin' };
        });
    }

    async createRegularUser(email, password, name, orgId) {
        const passwordHash = await bcrypt.hash(password, 10);
        return knex.transaction(async trx => {
            const userId = uuidv4();
            await trx('users').insert({
                id: userId,
                email,
                passwordHash,
                name: name || 'User'
            });
            await trx('memberships').insert({
                userId,
                orgId,
                role: 'user'
            });
            return { userId, email, role: 'user' };
        });
    }

    async validatePassword(user, password) {
        return bcrypt.compare(password, user.passwordHash);
    }

    async getUserContext(userId) {
        const user = await this.findById(userId);
        if (!user) return null;

        const membership = await knex('memberships').where({ userId }).first();
        if (!membership) return null;

        const org = await knex('orgs').where({ id: membership.orgId }).first();
        const sub = await knex('subscriptions')
            .where({ orgId: org.id, status: 'active' })
            .orderBy('created_at', 'desc')
            .first();

        const planKey = sub ? sub.planKey : 'normal';

        return {
            user: { id: user.id, email: user.email, name: user.name },
            org: { id: org.id, name: org.name },
            role: membership.role,
            planKey
        };
    }
}

module.exports = new UserService();
