import { describe, expect, it } from 'vitest';
import { UI_MESSAGES } from '../messages';

describe('UI_MESSAGES', () => {
  it('contains all 5 non-Chinese locale catalogs', () => {
    expect(Object.keys(UI_MESSAGES)).toEqual(
      expect.arrayContaining(['en-US', 'ja-JP', 'ko-KR', 'fr-FR', 'es-ES']),
    );
  });

  it('en-US has translations for core navigation items', () => {
    const en = UI_MESSAGES['en-US'];
    expect(en['概览']).toBe('Overview');
    expect(en['内容']).toBe('Content');
    expect(en['系统']).toBe('System');
    expect(en['统计']).toBe('Analytics');
  });

  it('ja-JP has translations for core navigation items', () => {
    const ja = UI_MESSAGES['ja-JP'];
    expect(ja['概览']).toBe('概要');
    expect(ja['内容']).toBe('コンテンツ');
    expect(ja['登录']).toBe('ログイン');
  });

  it('ko-KR has translations for core navigation items', () => {
    const ko = UI_MESSAGES['ko-KR'];
    expect(ko['概览']).toBe('개요');
    expect(ko['内容']).toBe('콘텐츠');
    expect(ko['登录']).toBe('로그인');
  });

  it('fr-FR has translations for core navigation items', () => {
    const fr = UI_MESSAGES['fr-FR'];
    expect(fr['概览']).toBe('Vue d\u2019ensemble');
    expect(fr['内容']).toBe('Contenu');
    expect(fr['登录']).toBe('Se connecter');
  });

  it('es-ES has translations for core navigation items', () => {
    const es = UI_MESSAGES['es-ES'];
    expect(es['概览']).toBe('Resumen');
    expect(es['内容']).toBe('Contenido');
    expect(es['登录']).toBe('Iniciar sesión');
  });

  it('all locale catalogs have the same key for 登录 (sign-in)', () => {
    for (const tag of Object.keys(UI_MESSAGES)) {
      expect(UI_MESSAGES[tag]['登录']).toBeTruthy();
    }
  });

  it('all locale catalogs have the key for 退出登录 (sign-out)', () => {
    for (const tag of Object.keys(UI_MESSAGES)) {
      expect(UI_MESSAGES[tag]['退出登录']).toBeTruthy();
    }
  });

  it('supports interpolation placeholder patterns in translated values', () => {
    const en = UI_MESSAGES['en-US'];
    // {count} and {name} placeholders must be preserved in translations
    expect(en['站点 {count}']).toContain('{count}');
    expect(en['语言: {name}']).toContain('{name}');
    expect(en['由 {name} 修改']).toContain('{name}');
  });
});
