import { StateService } from '../../../src/dashboard/services/state.service';

describe('StateService Unit Tests', () => {
  let stateService: StateService;

  beforeEach(() => {
    stateService = new StateService();
    stateService.clearAllState(); // Ensure a clean state for each test
  });

  it('should set and get state correctly', () => {
    stateService.setState('testKey', 'testValue');
    expect(stateService.getState('testKey')).toBe('testValue');
  });

  it('should return undefined for non-existent state keys', () => {
    expect(stateService.getState('nonExistentKey')).toBeUndefined();
  });

  it('should notify listeners when state changes', () => {
    const listener = jest.fn();
    stateService.subscribe('testKey', listener);

    stateService.setState('testKey', 'newValue');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('newValue', undefined, 'testKey');

    stateService.setState('testKey', 'anotherValue');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith('anotherValue', 'newValue', 'testKey');
  });

  it('should notify global listeners for any state change', () => {
    const globalListener = jest.fn();
    stateService.subscribeGlobal(globalListener);

    stateService.setState('key1', 'value1');
    expect(globalListener).toHaveBeenCalledTimes(1);
    expect(globalListener).toHaveBeenCalledWith('value1', undefined, 'key1');

    stateService.setState('key2', 'value2');
    expect(globalListener).toHaveBeenCalledTimes(2);
    expect(globalListener).toHaveBeenCalledWith('value2', undefined, 'key2');
  });

  it('should unsubscribe specific listeners', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    const unsubscribe1 = stateService.subscribe('testKey', listener1);
    stateService.subscribe('testKey', listener2);

    stateService.setState('testKey', 'value1');
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    unsubscribe1();
    stateService.setState('testKey', 'value2');
    expect(listener1).toHaveBeenCalledTimes(1); // Should not be called again
    expect(listener2).toHaveBeenCalledTimes(2);
  });

  it('should unsubscribe global listeners', () => {
    const globalListener = jest.fn();
    const unsubscribeGlobal = stateService.subscribeGlobal(globalListener);

    stateService.setState('key1', 'value1');
    expect(globalListener).toHaveBeenCalledTimes(1);

    unsubscribeGlobal();
    stateService.setState('key2', 'value2');
    expect(globalListener).toHaveBeenCalledTimes(1); // Should not be called again
  });

  it('should delete state correctly and notify listeners', () => {
    const listener = jest.fn();
    stateService.setState('testKey', 'initialValue');
    stateService.subscribe('testKey', listener);

    const deleted = stateService.deleteState('testKey');
    expect(deleted).toBe(true);
    expect(stateService.hasState('testKey')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(undefined, 'initialValue', 'testKey');
  });

  it('should update state with partial object', () => {
    stateService.setState('user', { name: 'Alice', age: 30 });
    stateService.updateState('user', { age: 31, city: 'New York' });
    expect(stateService.getState('user')).toEqual({ name: 'Alice', age: 31, city: 'New York' });
  });

  it('should get state with default value', () => {
    expect(stateService.getStateOrDefault('nonExistent', 'defaultValue')).toBe('defaultValue');
    stateService.setState('existing', 'actualValue');
    expect(stateService.getStateOrDefault('existing', 'defaultValue')).toBe('actualValue');
  });

  it('should clear all state', () => {
    stateService.setState('key1', 'value1');
    stateService.setState('key2', 'value2');
    stateService.clearAllState();
    expect(stateService.getKeys().length).toBe(0);
  });

  it('should persist and restore state from localStorage', () => {
    // Mock localStorage
    const localStorageMock = (() => {
      let store: { [key: string]: string } = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        clear: () => { store = {}; }
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });

    stateService.setState('persistedKey', 'persistedValue');
    stateService.persistState();
    stateService.clearAllState();
    stateService.restoreState();
    expect(stateService.getState('persistedKey')).toBe('persistedValue');

    stateService.clearAllState();
    stateService.setState('keyToPersist', 'valueToPersist');
    stateService.setState('keyNotToPersist', 'valueNotToPersist');
    stateService.persistState(['keyToPersist']);
    stateService.clearAllState();
    stateService.restoreState(['keyToPersist']);
    expect(stateService.getState('keyToPersist')).toBe('valueToPersist');
    expect(stateService.getState('keyNotToPersist')).toBeUndefined();
  });

  it('should create computed state that updates with dependencies', () => {
    stateService.setState('firstName', 'John');
    stateService.setState('lastName', 'Doe');

    const fullNameCompute = jest.fn((firstName, lastName) => `${firstName} ${lastName}`);
    const unsubscribeComputed = stateService.createComputed(
      'fullName',
      ['firstName', 'lastName'],
      fullNameCompute
    );

    expect(stateService.getState('fullName')).toBe('John Doe');
    expect(fullNameCompute).toHaveBeenCalledTimes(1); // Initial computation

    stateService.setState('firstName', 'Jane');
    expect(stateService.getState('fullName')).toBe('Jane Doe');
    expect(fullNameCompute).toHaveBeenCalledTimes(2); // Updated when dependency changes

    unsubscribeComputed();
    stateService.setState('lastName', 'Smith');
    expect(stateService.getState('fullName')).toBe('Jane Doe'); // Should not update after unsubscribe
    expect(fullNameCompute).toHaveBeenCalledTimes(2); // Should not be called again
  });
});
