import * as React from "react";

interface ITransitionGroupProps {
  enterDuration: number;
  exitDuration: number;
  className: string;
  children: React.ReactElement | Array<React.ReactElement>;
}

interface IPositionedChild {
  index: number;
  element: React.ReactElement;
}

function toArray(children: Array<React.ReactElement> | React.ReactElement) {
  return children instanceof Array ? [...children] : [children];
}

function getKeys(array: Array<React.ReactElement> | React.ReactElement) {
  return new Set(toArray(array).map(element => element.key));
}

function getOldAndNewItems(
  oldArray: Array<React.ReactElement>,
  currentArray: React.ReactElement | Array<React.ReactElement>
) {
  const oldKeys = getKeys(oldArray);
  const currentKeys = getKeys(currentArray);
  const oldItems = oldArray
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => !currentKeys.has(element.key));
  const newKeys = Array.from(currentKeys.values()).filter(
    key => !oldKeys.has(key)
  ) as Array<string>;
  return { oldItems, newKeys };
}

// This is subtle. We need to calculate how many of the removed items we
// already know about. But we also need to push the index of those new items
// to reflect the other leaving items we're going to render.
// So, if you have items A, B and C and remove A and then B, at the point that
// you remove B its index in the `children` array will be 0, but if we're still
// rendering the leaving animation for A it's ACTUAL index should be 1. This will
// automatically be reduced in `removeLeavingItem` which A disappears for good.
function getNewLeavingChildren(
  oldItems: Array<IPositionedChild>,
  leavingChildren: Array<IPositionedChild>
): Array<IPositionedChild> {
  return oldItems.reduce((memoArray, item) => {
    let indexPush = 0;
    // Filter is used here instead of `find` to ensure we loop over every item
    // in the array for `indexPush` purposes
    const isAlreadyLeaving = !!leavingChildren.filter(
      ({ element: thisElement, index }) => {
        if (index <= item.index + indexPush) {
          indexPush++;
        }
        return thisElement.key === item.element.key;
      }
    ).length;
    return isAlreadyLeaving
      ? memoArray
      : memoArray.concat({
          element: item.element,
          index: item.index + indexPush
        });
  }, []);
}

function cloneWithClassName(element: React.ReactElement, className: string) {
  const { className: elementClassName = "", children } = element.props;
  return React.cloneElement(
    element,
    { className: `${elementClassName} ${className}` },
    children
  );
}

export const TransitionGroup: React.FC<ITransitionGroupProps> = ({
  enterDuration,
  exitDuration,
  className,
  children
}) => {
  const [currentChildren, setCurrentChildren] = React.useState(
    toArray(children)
  );
  const [leavingChildren, setLeavingChildren] = React.useState<
    Array<IPositionedChild>
  >([]);
  const [enteringKeys, setEnteringKeys] = React.useState<Set<string>>(
    new Set()
  );
  const [activeKeys, setActiveKeys] = React.useState<Set<string>>(new Set());
  const oldChildren = React.useRef(children);
  const leaveTimeouts = React.useRef(new Map<string, number>());
  const enterTimeouts = React.useRef(new Map<string, number>());

  const removeLeavingItem = React.useCallback(
    (key: string) => () => {
      setCurrentChildren(_currentChildren =>
        _currentChildren.filter(item => item.key !== key)
      );
      window.clearTimeout(leaveTimeouts.current.get(key));
      leaveTimeouts.current.delete(key);
      setLeavingChildren(_leavingChildren => {
        const leavingItem = _leavingChildren.find(
          ({ element }) => element.key === key
        );
        if (!leavingItem) {
          return _leavingChildren;
        }
        return (
          _leavingChildren
            .filter(({ element }) => {
              return element.key !== key;
            })
            // Shift down the index of any leaving items after this in the array
            .map(item => {
              if (item.index > leavingItem.index) {
                return { element: item.element, index: item.index - 1 };
              }
              return item;
            })
        );
      });
    },
    []
  );
  const settleEnteringItem = React.useCallback(
    (key: string) => () => {
      setEnteringKeys(_newEnteringItems => {
        _newEnteringItems.delete(key);
        return _newEnteringItems;
      });
      window.clearTimeout(enterTimeouts.current.get(key));
      enterTimeouts.current.delete(key);
    },
    []
  );
  const cancelLeavingItem = React.useCallback((key: string) => {
    window.clearTimeout(leaveTimeouts.current.get(key));
    leaveTimeouts.current.delete(key);
  }, []);
  const setItemToLeave = React.useCallback(
    (key: string) => {
      if (leaveTimeouts.current.has(key)) {
        return;
      }
      leaveTimeouts.current.set(
        key,
        window.setTimeout(removeLeavingItem(key), exitDuration)
      );
    },
    [exitDuration, removeLeavingItem]
  );
  const setEnteringItemToSettle = React.useCallback(
    (key: string) => {
      if (enterTimeouts.current.has(key)) {
        return;
      }
      enterTimeouts.current.set(
        key,
        window.setTimeout(settleEnteringItem(key), enterDuration)
      );
    },
    [enterDuration, settleEnteringItem]
  );
  const removeActiveKey = React.useCallback(
    (key: string) => {
      window.setTimeout(() => {
        setActiveKeys(_activeKeys => {
          console.log("Active keys were", [..._activeKeys]);
          console.log("removing key", key);
          _activeKeys.delete(key);
          console.log("Active keys are", [..._activeKeys]);
          return _activeKeys;
        });
      }, 2000);
    },
    [setActiveKeys]
  );

  React.useEffect(() => {
    const arrayChildren = toArray(children);
    const { oldItems, newKeys } = getOldAndNewItems(
      toArray(oldChildren.current),
      arrayChildren
    );
    newKeys.forEach(key => {
      cancelLeavingItem(key);
      setEnteringItemToSettle(key);
    });
    if (newKeys.length) {
      setEnteringKeys(_enteringKeys => {
        newKeys.forEach(newKey => _enteringKeys.add(newKey));
        return new Set(_enteringKeys);
      });
    }
    const newLeavingChildren = getNewLeavingChildren(oldItems, leavingChildren);
    const newActiveKeys = newKeys.concat(
      newLeavingChildren.map(({ element }) => element.key as string)
    );
    if (newActiveKeys.length) {
      console.log(newActiveKeys);
      setActiveKeys(new Set([...activeKeys, ...newActiveKeys]));
      newActiveKeys.forEach(removeActiveKey);
    }
    const allLeavingChildren = leavingChildren.concat(newLeavingChildren);
    if (newLeavingChildren.length) {
      setLeavingChildren(allLeavingChildren);
    }
    oldItems.forEach(({ element }) => {
      setItemToLeave(element.key as string);
    });

    const newChildren = new Array(
      arrayChildren.length + allLeavingChildren.length
    );
    allLeavingChildren.forEach(item => {
      newChildren[item.index] = cloneWithClassName(
        item.element,
        `${className} ${className}-leaving`
      );
    });
    for (
      let newIndex = 0, oldIndex = 0;
      newIndex < arrayChildren.length + allLeavingChildren.length;
      newIndex++
    ) {
      const itemKey = arrayChildren[oldIndex].key as string;
      if (newChildren[newIndex]) {
        continue;
      }
      let itemClassName = className;
      if (enteringKeys.has(itemKey)) {
        itemClassName += ` ${className}-entering`;
        if (activeKeys.has(itemKey)) {
          itemClassName += ` ${className}-entering-active`;
        }
      }
      newChildren[newIndex] = cloneWithClassName(
        arrayChildren[oldIndex],
        itemClassName
      );
      oldIndex++;
    }
    oldChildren.current = children;
    setCurrentChildren(newChildren);
  }, [
    children,
    leavingChildren,
    enteringKeys,
    activeKeys,
    cancelLeavingItem,
    setItemToLeave,
    setEnteringItemToSettle,
    removeActiveKey,
    className
  ]);

  console.log("rendering");

  return <React.Fragment>{currentChildren}</React.Fragment>;
};
