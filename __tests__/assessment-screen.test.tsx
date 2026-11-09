import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import AssessmentScreen from '../src/AssessmentScreen';

let tree: Renderer.ReactTestRenderer;
const onBack = jest.fn();
const onHelp = jest.fn();
async function press(label: string) {
  let target = tree.root.findAll(node => node.props.children === label)[0];
  while (target && typeof target.props.onPress !== 'function') {
    target = target.parent!;
  }
  await act(async () => target.props.onPress());
}
async function answerAll() {
  // Select both extremes and intermediate options across the four groups.
  const selections = [0, 4, 2, 1];
  await act(async () => {
    const radios = tree.root.findAll(
      node =>
        node.props.accessibilityRole === 'radio' &&
        typeof node.props.onPress === 'function',
    );
    selections.forEach((value, index) =>
      radios[index * 5 + value].props.onPress(),
    );
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => {
    tree = Renderer.create(
      <AssessmentScreen darkMode={false} onBack={onBack} onHelp={onHelp} />,
    );
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});

test('exige todas as respostas antes de mostrar o resultado', async () => {
  await press('Ver resultado');
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Responda todas as perguntas',
  );
  expect(JSON.stringify(tree.toJSON())).not.toContain('Seu resumo de hoje');
});

test('resume respostas reais, permite revisar e refazer sem respostas anteriores', async () => {
  await answerAll();
  await press('Ver resultado');
  const result = JSON.stringify(tree.toJSON());
  expect(result).toContain('Seu resumo de hoje');
  expect(result).toContain('Muito insatisfatório');
  expect(result).toContain('Muito satisfatório');
  expect(result).toContain('Regular');
  expect(result).toContain('Insatisfatório');
  expect(result).toContain('Não é diagnóstico');
  await press('Revisar respostas');
  expect(
    tree.root.findAll(
      node =>
        node.props.accessibilityRole === 'radio' &&
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityState.checked,
    ),
  ).toHaveLength(4);
  await press('Ver resultado');
  await press('Refazer autoavaliação');
  expect(
    tree.root.findAll(
      node =>
        node.props.accessibilityRole === 'radio' &&
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityState.checked,
    ),
  ).toHaveLength(0);
  await press('Ver resultado');
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Responda todas as perguntas',
  );
});

test('permite sair, acessar ajuda e concluir', async () => {
  await press('Voltar ao início');
  expect(onBack).toHaveBeenCalledTimes(1);
  await press('Acessar ajuda');
  expect(onHelp).toHaveBeenCalledTimes(1);
  await answerAll();
  await press('Ver resultado');
  await press('Concluir');
  expect(onBack).toHaveBeenCalledTimes(2);
});
