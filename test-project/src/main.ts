import { helper } from './helper';
import * as fs from 'fs';

class BaseClass {
  name: string;
  
  constructor(name: string) {
    this.name = name;
  }
}

class DerivedClass extends BaseClass {
  age: number;
  
  constructor(name: string, age: number) {
    super(name);
    this.age = age;
  }
  
  greet() {
    console.log(`Hello, I'm ${this.name}`);
    helper.doSomething();
    fs.readFileSync('test.txt');
  }
}