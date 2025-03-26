import { PrismaClient } from '@prisma/client';
import { GraphQLError } from 'graphql';
import { GraphQLResolveInfo } from 'graphql';
import {verifyToken} from "./auth.middleware";

const prisma = new PrismaClient();

interface Context {
    token?: string;
    user?: any;
}

export const authMiddleware = async (
    resolve: Function,
    parent: any,
    args: any,
    context: Context,
    info: GraphQLResolveInfo
) => {
    // Skip authentication for certain operations
    const publicOperations = [
        'loginUser',
        'registerUser',
        'IntrospectionQuery'
    ];

    // Check if the current operation is public
    const operationName = info.operation.name?.value;
    if (publicOperations.includes(operationName ?? '')) {
        return resolve(parent, args, context, info);
    }

    // Ensure token exists
    const token = context.token;
    if (!token) {
        throw new GraphQLError('No authentication token provided', {
            extensions: {
                code: 'UNAUTHENTICATED',
                reason: 'No token present in request'
            }
        });
    }

    try {
        // Verify the token
        const decoded = verifyToken(token);

        // Find the user with their roles
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            include: {
                roles: {
                    include: { role: true }
                }
            }
        });

        // Ensure user exists
        if (!user) {
            throw new GraphQLError('User not found', {
                extensions: {
                    code: 'UNAUTHENTICATED',
                    reason: 'User associated with token does not exist'
                }
            });
        }

        // Attach user to context
        context.user = {
            id: user.id,
            email: user.email,
            roles: user.roles.map(roleUser => roleUser.role.id)
        };

        // Continue with the resolver
        return resolve(parent, args, context, info);
    } catch (error) {
        // Handle different types of token errors
        if (error instanceof Error) {
            throw new GraphQLError('Authentication failed', {
                extensions: {
                    code: 'UNAUTHENTICATED',
                    reason: error.message
                }
            });
        }

        // Fallback error
        throw new GraphQLError('Unexpected authentication error', {
            extensions: {
                code: 'UNAUTHENTICATED'
            }
        });
    }
};