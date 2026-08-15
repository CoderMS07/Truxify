import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoSanitize, { hasNoSqlInjection, sanitizeNoSqlObject } from '../../src/middleware/mongoSanitize.js';
import { escapeRegExp } from '../../src/lib/escapeRegex.js';

describe('NoSQL Injection Prevention & Input Sanitization Security Suite', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(mongoSanitize());

    // Sample endpoints to test security middleware
    app.post('/api/test/login', (req, res) => {
      res.status(200).json({ status: 'ok', body: req.body });
    });

    app.get('/api/test/search', (req, res) => {
      const escapedQuery = escapeRegExp(req.query.q || '');
      res.status(200).json({ status: 'ok', query: req.query, escapedQuery });
    });
  });

  describe('mongoSanitize middleware', () => {
    it('should reject POST request with NoSQL operator ($gt) in body with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/test/login')
        .send({ username: 'admin', password: { $gt: '' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('NoSQL injection attempt detected');
    });

    it('should reject POST request with NoSQL operator ($ne) in nested body with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/test/login')
        .send({ filter: { email: { $ne: null } } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('NoSQL injection attempt detected');
    });

    it('should reject GET request with NoSQL operator in query parameters with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/test/search')
        .query('q[$where]=this.password');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('NoSQL injection attempt detected');
    });

    it('should allow valid standard JSON body and query without false positives', async () => {
      const res = await request(app)
        .post('/api/test/login')
        .send({ username: 'standardUser', password: 'securePassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.body.username).toBe('standardUser');
    });
  });

  describe('hasNoSqlInjection & sanitizeNoSqlObject helpers', () => {
    it('should detect NoSQL injection operators correctly', () => {
      expect(hasNoSqlInjection({ name: 'test' })).toBe(false);
      expect(hasNoSqlInjection({ name: { $gt: '' } })).toBe(true);
      expect(hasNoSqlInjection({ 'user.name': 'admin' })).toBe(true);
      expect(hasNoSqlInjection([{ normal: 'value' }, { injected: { $ne: 1 } }])).toBe(true);
    });

    it('should recursively strip prohibited NoSQL keys', () => {
      const input = {
        validKey: 'hello',
        $gt: 'malicious',
        nested: {
          $ne: 1,
          safeField: 'world',
        },
      };

      const sanitized = sanitizeNoSqlObject(input);
      expect(sanitized).toEqual({
        validKey: 'hello',
        nested: {
          safeField: 'world',
        },
      });
    });
  });

  describe('escapeRegExp helper for ReDoS prevention', () => {
    it('should safely escape regular expression special characters', () => {
      const dangerousInput = '.*+?^${}()|[]\\';
      const escaped = escapeRegExp(dangerousInput);

      expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');

      // Verify constructing RegExp with escaped input does not throw or trigger unexpected pattern matching
      const regex = new RegExp(escaped);
      expect(regex.test(dangerousInput)).toBe(true);
      expect(regex.test('normalText')).toBe(false);
    });

    it('should return empty string when non-string input is provided', () => {
      expect(escapeRegExp(null)).toBe('');
      expect(escapeRegExp(undefined)).toBe('');
      expect(escapeRegExp(12345)).toBe('');
    });
  });
});
